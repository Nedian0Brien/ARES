import { spawn } from 'node:child_process';

export const DEFAULT_CODEX_RUNTIME = 'codex';
export const DEFAULT_AGENT_TIMEOUT_MS = 45000;

function pickValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
}

function toJsonLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractContentText(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) =>
      pickValue(
        part?.text,
        part?.value,
        part?.content,
        part?.output_text,
        Array.isArray(part?.content) ? extractContentText(part.content) : '',
      ),
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractAgentMessageText(event) {
  const item = event?.item || event?.data?.item || event;
  const message = item?.message || item;
  const content = message?.content || message?.parts || item?.content;

  return pickValue(
    event?.text,
    message?.text,
    message?.output_text,
    item?.text,
    extractContentText(content),
  );
}

function extractCommandExecution(event) {
  const item = event?.item || event?.data?.item || event;
  const command = pickValue(item?.command, item?.command_line, item?.commandLine, item?.argv?.join(' '));
  const stdout = pickValue(item?.stdout, item?.output?.stdout, item?.result?.stdout);
  const stderr = pickValue(item?.stderr, item?.output?.stderr, item?.result?.stderr);
  const exitCode = Number(
    pickValue(item?.exit_code, item?.exitCode, item?.result?.exit_code, item?.result?.exitCode, item?.status_code),
  );

  return {
    command,
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    id: pickValue(item?.id, event?.id),
    stderr,
    stdout,
  };
}

function ingestRuntimeEvent(summary, event) {
  if (!event || typeof event !== 'object') {
    return;
  }

  summary.events.push(event);

  const type = pickValue(event.type, event.event, event.kind);
  if (type === 'thread.started') {
    summary.threadId = pickValue(
      event.thread_id,
      event.threadId,
      event.thread?.id,
      event.data?.thread_id,
      event.data?.thread?.id,
    );
    return;
  }

  const item = event?.item || event?.data?.item || event;
  const itemType = pickValue(item?.type, event.item_type, event.itemType);
  if (type === 'item.completed.agent_message' || itemType === 'agent_message') {
    const text = extractAgentMessageText(event);
    if (text) {
      summary.agentMessages.push({
        id: pickValue(item?.id, event?.id),
        text,
      });
      summary.finalMessage = text;
    }
    return;
  }

  if (type === 'item.completed.command_execution' || itemType === 'command_execution') {
    summary.commandExecutions.push(extractCommandExecution(event));
  }
}

function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Agent response was empty.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with loose extraction.
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return JSON.parse(objectMatch[0]);
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    return JSON.parse(arrayMatch[0]);
  }

  throw new Error('Agent response did not contain valid JSON.');
}

export function buildCodexExecArgs({
  cwd,
  prompt,
  sandbox = 'read-only',
} = {}) {
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '-s',
    sandbox,
    '-C',
    cwd,
    '--color',
    'never',
    prompt,
  ];
}

export function createAgentRuntime({
  cwd,
  runtimeName = DEFAULT_CODEX_RUNTIME,
  spawnImpl = spawn,
} = {}) {
  if (!cwd) {
    throw new Error('cwd is required to create the agent runtime.');
  }

  function startJsonTask({
    prompt,
    sandbox = 'read-only',
    taskCwd = cwd,
    timeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
  } = {}) {
    const args = buildCodexExecArgs({
      cwd: taskCwd,
      prompt,
      sandbox,
    });
    const child = spawnImpl(runtimeName, args, {
      cwd: taskCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let buffered = '';
    let aborted = false;
    let timedOut = false;

    const summary = {
      agentMessages: [],
      commandExecutions: [],
      events: [],
      finalMessage: '',
      rawStderr: '',
      rawStdout: '',
      threadId: '',
    };

    function flushBuffer(force = false) {
      const chunks = buffered.split(/\r?\n/);
      buffered = force ? '' : chunks.pop() || '';

      for (const line of force ? chunks.concat(buffered).filter(Boolean) : chunks) {
        try {
          ingestRuntimeEvent(summary, JSON.parse(line));
        } catch {
          // Ignore non-JSON lines emitted by the CLI wrapper.
        }
      }
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      buffered += chunk;
      flushBuffer();
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timeout.unref?.();

    const promise = new Promise((resolve, reject) => {
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        flushBuffer(true);

        summary.rawStdout = stdout;
        summary.rawStderr = stderr.trim();

        if (timedOut) {
          reject(new Error(`Agent runtime timed out after ${timeoutMs}ms.`));
          return;
        }

        if (aborted) {
          reject(new Error('Agent runtime aborted.'));
          return;
        }

        if (code !== 0) {
          const reason = summary.rawStderr || signal || `exit code ${code}`;
          reject(new Error(`Agent runtime failed: ${reason}`));
          return;
        }

        resolve(summary);
      });
    });

    return {
      abort() {
        if (child.exitCode === null) {
          aborted = true;
          child.kill('SIGTERM');
        }
      },
      promise,
    };
  }

  return {
    async checkAvailability() {
      const probe = spawnImpl(runtimeName, ['--version'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return new Promise((resolve) => {
        probe.on('error', () => resolve(false));
        probe.on('close', (code) => resolve(code === 0));
      });
    },

    async runJsonTask(options) {
      const task = startJsonTask(options);
      return task.promise;
    },

    startJsonTask,

    parseJsonFromMessages(summary) {
      const message =
        summary?.finalMessage ||
        summary?.agentMessages?.at(-1)?.text ||
        toJsonLines(summary?.rawStdout).join('\n');
      return parseJsonFromText(message);
    },

    runtimeName,
  };
}
