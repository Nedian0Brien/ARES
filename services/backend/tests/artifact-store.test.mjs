import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createLocalArtifactStore } from '../lib/artifact-store.mjs';

test('local artifact store writes and reads typed artifacts under the root directory', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-artifacts-'));
  const store = createLocalArtifactStore({ rootDir });

  await store.writeJson('data/runtime/reading/session-1/table.json', [{ metric: 'accuracy', value: 0.91 }]);
  await store.writeText('data/runtime/reading/session-1/note.txt', 'hello artifact');
  await store.writeBinary('data/runtime/reading/session-1/source.pdf', Buffer.from('%PDF-test'));

  assert.deepEqual(await store.readJson('data/runtime/reading/session-1/table.json'), [{ metric: 'accuracy', value: 0.91 }]);
  assert.equal(await store.readText('data/runtime/reading/session-1/note.txt'), 'hello artifact');
  assert.equal((await store.readFile('data/runtime/reading/session-1/source.pdf')).toString('utf8'), '%PDF-test');
  assert.equal(await store.exists('data/runtime/reading/session-1/source.pdf'), true);
});

test('local artifact store rejects paths outside the root directory', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-artifacts-'));
  const store = createLocalArtifactStore({ rootDir });

  await assert.rejects(store.writeText('../escape.txt', 'nope'), /Unsafe artifact path/);
  await assert.rejects(store.readFile('../escape.txt'), /Unsafe artifact path/);
});
