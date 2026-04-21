import { promises as fs } from 'node:fs';
import path from 'node:path';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureRuntimeStore(seedFile, runtimeFile) {
  await fs.mkdir(path.dirname(runtimeFile), { recursive: true });

  try {
    await fs.access(runtimeFile);
  } catch {
    const seed = await fs.readFile(seedFile, 'utf8');
    await fs.writeFile(runtimeFile, seed, 'utf8');
  }

  const raw = await fs.readFile(runtimeFile, 'utf8');
  return JSON.parse(raw);
}

export async function createStore({ seedFile, runtimeFile }) {
  let state = await ensureRuntimeStore(seedFile, runtimeFile);
  let writeChain = Promise.resolve();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2);
    writeChain = writeChain.then(() => fs.writeFile(runtimeFile, snapshot, 'utf8'));
    await writeChain;
  }

  function ensureProject(projectId) {
    const project = state.projects.find((entry) => entry.id === projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    state.library[projectId] ||= [];
    state.readingQueue[projectId] ||= [];

    return project;
  }

  function libraryFor(projectId) {
    ensureProject(projectId);
    return state.library[projectId];
  }

  function queueFor(projectId) {
    ensureProject(projectId);
    return state.readingQueue[projectId];
  }

  function projectSummary(project) {
    const library = libraryFor(project.id);
    const queue = queueFor(project.id);

    return {
      ...clone(project),
      libraryCount: library.length,
      queueCount: queue.length,
      recentLibrary: clone(library.slice(0, 3)),
    };
  }

  return {
    getProjects() {
      return state.projects.map(projectSummary);
    },

    getProject(projectId) {
      return projectSummary(ensureProject(projectId));
    },

    getLibrary(projectId) {
      return clone(libraryFor(projectId));
    },

    getSavedPaperIds(projectId) {
      return new Set(libraryFor(projectId).map((paper) => paper.paperId));
    },

    getQueuedPaperIds(projectId) {
      return new Set(queueFor(projectId).map((paper) => paper.paperId));
    },

    async savePaper(projectId, paper) {
      ensureProject(projectId);
      const library = libraryFor(projectId);
      const nextPaper = {
        ...clone(paper),
        savedAt: new Date().toISOString(),
      };
      const index = library.findIndex((entry) => entry.paperId === nextPaper.paperId);

      if (index >= 0) {
        library[index] = { ...library[index], ...nextPaper };
      } else {
        library.unshift(nextPaper);
      }

      await persist();
      return clone(nextPaper);
    },

    async removePaper(projectId, paperId) {
      ensureProject(projectId);
      state.library[projectId] = libraryFor(projectId).filter((paper) => paper.paperId !== paperId);
      await persist();
      return true;
    },

    async queuePaper(projectId, paper) {
      ensureProject(projectId);
      const queue = queueFor(projectId);
      const nextEntry = {
        paperId: paper.paperId,
        title: paper.title,
        paperUrl: paper.paperUrl,
        queuedAt: new Date().toISOString(),
      };
      const index = queue.findIndex((entry) => entry.paperId === nextEntry.paperId);

      if (index >= 0) {
        queue[index] = { ...queue[index], ...nextEntry };
      } else {
        queue.unshift(nextEntry);
      }

      await persist();
      return clone(nextEntry);
    },
  };
}
