import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { createAgentRuntime, normaliseAgentRuntimeStderr } from '../lib/agent-runtime.mjs';

test('normaliseAgentRuntimeStderr removes Codex stdin notice noise', () => {
  assert.equal(normaliseAgentRuntimeStderr('Reading additional input from stdin...\n'), '');
  assert.equal(
    normaliseAgentRuntimeStderr('Reading additional input from stdin...\nreal warning\n'),
    'real warning',
  );
});

function createStreamingSpawn(events) {
  return function spawnImpl() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 0;
      child.emit('close', 0, null);
    };

    process.nextTick(() => {
      for (const event of events) {
        child.stdout.write(`${JSON.stringify(event)}\n`);
      }
      child.exitCode = 0;
      child.stdout.end();
      child.emit('close', 0, null);
    });

    return child;
  };
}

test('agent runtime streams normalized progress events while task is running', async () => {
  const progressEvents = [];
  const runtime = createAgentRuntime({
    cwd: '/workspace',
    spawnImpl: createStreamingSpawn([
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: {
          type: 'command_execution',
          command: 'node services/backend/bin/openalex-helper.mjs --query demo',
          exit_code: 0,
          stdout: '{"results":[]}',
        },
      },
      {
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: '{"rankedPaperIds":[{"paperId":"paper-1","rationale":"best match"}],"warning":""}',
        },
      },
      { type: 'turn.completed' },
    ]),
  });

  await runtime.runJsonTask({
    onEvent: (event) => {
      progressEvents.push(event);
    },
    prompt: 'rank papers',
  });

  assert.ok(progressEvents.some((event) => event.type === 'status' && /thread/i.test(event.label)));
  assert.ok(progressEvents.some((event) => event.type === 'tool' && /openalex-helper/.test(event.detail)));
  assert.ok(progressEvents.some((event) => event.type === 'agent_message' && /rankedPaperIds/.test(event.detail)));
  assert.ok(progressEvents.some((event) => event.type === 'status' && event.status === 'done'));
});
