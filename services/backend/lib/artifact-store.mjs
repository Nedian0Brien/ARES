import path from 'node:path';
import { promises as fs } from 'node:fs';

function resolveSafePath(rootDir, relativePath) {
  const next = path.resolve(rootDir, relativePath);
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
