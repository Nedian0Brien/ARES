import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createLocalArtifactStore, createS3CompatibleArtifactStore } from '../lib/artifact-store.mjs';

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

function createMockObjectClient() {
  const objects = new Map();
  return {
    objects,
    async getObject({ Bucket, Key }) {
      const storageKey = `${Bucket}/${Key}`;
      if (!objects.has(storageKey)) {
        throw new Error('not found');
      }
      return {
        Body: objects.get(storageKey).Body,
      };
    },
    async getSignedUrl({ Bucket, Expires, Key }) {
      return `https://objects.example.test/${Bucket}/${Key}?expires=${Expires}`;
    },
    async headObject({ Bucket, Key }) {
      if (!objects.has(`${Bucket}/${Key}`)) {
        throw new Error('not found');
      }
      return {};
    },
    async putObject(input) {
      objects.set(`${input.Bucket}/${input.Key}`, input);
      return {};
    },
  };
}

test('s3-compatible artifact store reads, writes, and signs object keys with a mock client', async () => {
  const client = createMockObjectClient();
  const store = createS3CompatibleArtifactStore({
    bucket: 'ares-artifacts',
    client,
    signedUrlTtlSeconds: 120,
  });

  await store.writeJson('data/runtime/reading/session-1/table.json', [{ name: 'f1', value: 0.73 }]);
  await store.writeText('data/runtime/reading/session-1/log.txt', 'ready');

  assert.deepEqual(await store.readJson('data/runtime/reading/session-1/table.json'), [{ name: 'f1', value: 0.73 }]);
  assert.equal(await store.readText('data/runtime/reading/session-1/log.txt'), 'ready');
  assert.equal(await store.exists('data/runtime/reading/session-1/table.json'), true);
  assert.equal(
    await store.getSignedUrl('data/runtime/reading/session-1/table.json'),
    'https://objects.example.test/ares-artifacts/data/runtime/reading/session-1/table.json?expires=120',
  );
  assert.equal(store.resolvePath('data/runtime/reading/session-1/table.json'), 's3://ares-artifacts/data/runtime/reading/session-1/table.json');
});

test('s3-compatible artifact store rejects unsafe object keys', async () => {
  const store = createS3CompatibleArtifactStore({
    bucket: 'ares-artifacts',
    client: createMockObjectClient(),
  });

  await assert.rejects(store.writeText('../escape.txt', 'nope'), /Unsafe artifact path/);
  await assert.rejects(store.getSignedUrl('/absolute.txt'), /Unsafe artifact path/);
});
