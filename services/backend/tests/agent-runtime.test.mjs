import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseAgentRuntimeStderr } from '../lib/agent-runtime.mjs';

test('normaliseAgentRuntimeStderr removes Codex stdin notice noise', () => {
  assert.equal(normaliseAgentRuntimeStderr('Reading additional input from stdin...\n'), '');
  assert.equal(
    normaliseAgentRuntimeStderr('Reading additional input from stdin...\nreal warning\n'),
    'real warning',
  );
});
