import path from 'node:path';
import { promises as fs } from 'node:fs';

function normalizeArtifactKey(relativePath) {
  const value = String(relativePath || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(value);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new Error('Unsafe artifact path requested.');
  }
  return normalized;
}

function resolveSafePath(rootDir, relativePath) {
  const next = path.resolve(rootDir, normalizeArtifactKey(relativePath));
  const safeRoot = path.resolve(rootDir);
  if (!next.startsWith(safeRoot)) {
    throw new Error('Unsafe artifact path requested.');
  }
  return next;
}

export function createLocalArtifactStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('rootDir is required to create a local artifact store.');
  }

  async function ensureDirectory(relativePath) {
    const directory = resolveSafePath(rootDir, relativePath);
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }

  async function writeFile(relativePath, payload, options = {}) {
    const filePath = resolveSafePath(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload, options);
    return relativePath;
  }

  return {
    async exists(relativePath) {
      try {
        await fs.access(resolveSafePath(rootDir, relativePath));
        return true;
      } catch {
        return false;
      }
    },

    ensureDirectory,

    async readFile(relativePath) {
      return fs.readFile(resolveSafePath(rootDir, relativePath));
    },

    async readJson(relativePath) {
      return JSON.parse(await fs.readFile(resolveSafePath(rootDir, relativePath), 'utf8'));
    },

    async readText(relativePath) {
      return fs.readFile(resolveSafePath(rootDir, relativePath), 'utf8');
    },

    resolvePath(relativePath) {
      return resolveSafePath(rootDir, relativePath);
    },

    writeBinary(relativePath, payload) {
      return writeFile(relativePath, payload);
    },

    writeJson(relativePath, payload) {
      return writeFile(relativePath, JSON.stringify(payload, null, 2), 'utf8');
    },

    writeText(relativePath, payload) {
      return writeFile(relativePath, payload, 'utf8');
    },
  };
}

async function objectBodyToBuffer(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body && typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error('Object storage response body is not readable.');
}

export function createS3CompatibleArtifactStore({
  bucket,
  client,
  signedUrlTtlSeconds = 300,
} = {}) {
  if (!bucket) {
    throw new Error('bucket is required to create an object artifact store.');
  }
  if (!client || typeof client.putObject !== 'function' || typeof client.getObject !== 'function') {
    throw new Error('client with putObject/getObject is required to create an object artifact store.');
  }

  async function writeObject(relativePath, payload, contentType = 'application/octet-stream') {
    const key = normalizeArtifactKey(relativePath);
    await client.putObject({
      Body: payload,
      Bucket: bucket,
      ContentType: contentType,
      Key: key,
    });
    return key;
  }

  async function readObject(relativePath) {
    const key = normalizeArtifactKey(relativePath);
    const object = await client.getObject({
      Bucket: bucket,
      Key: key,
    });
    return objectBodyToBuffer(object.Body);
  }

  return {
    async exists(relativePath) {
      const key = normalizeArtifactKey(relativePath);
      if (typeof client.headObject === 'function') {
        try {
          await client.headObject({ Bucket: bucket, Key: key });
          return true;
        } catch {
          return false;
        }
      }
      try {
        await client.getObject({ Bucket: bucket, Key: key });
        return true;
      } catch {
        return false;
      }
    },

    async getSignedUrl(relativePath, { expiresIn = signedUrlTtlSeconds } = {}) {
      if (typeof client.getSignedUrl !== 'function') {
        throw new Error('Object storage client does not support signed URLs.');
      }
      return client.getSignedUrl({
        Bucket: bucket,
        Expires: expiresIn,
        Key: normalizeArtifactKey(relativePath),
      });
    },

    async readFile(relativePath) {
      return readObject(relativePath);
    },

    async readJson(relativePath) {
      return JSON.parse((await readObject(relativePath)).toString('utf8'));
    },

    async readText(relativePath) {
      return (await readObject(relativePath)).toString('utf8');
    },

    resolvePath(relativePath) {
      return `s3://${bucket}/${normalizeArtifactKey(relativePath)}`;
    },

    writeBinary(relativePath, payload) {
      return writeObject(relativePath, payload);
    },

    writeJson(relativePath, payload) {
      return writeObject(relativePath, JSON.stringify(payload, null, 2), 'application/json; charset=utf-8');
    },

    writeText(relativePath, payload) {
      return writeObject(relativePath, payload, 'text/plain; charset=utf-8');
    },
  };
}
