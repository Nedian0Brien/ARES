import { pathToFileURL } from 'node:url';

import { createConfiguredRetrievalScorer } from '../services/backend/lib/retrieval-scorer.mjs';

const DEFAULT_MIN_TOP_SCORE = 0.8;

function readArg(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) {
    return fallback;
  }

  return args[index + 1];
}

function numberArg(args, name, fallback = 0) {
  const value = readArg(args, name, '');
  if (!value) {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scoreId(score = {}) {
  return String(score.chunkId || score.id || '').trim();
}

function scoreValue(score = {}) {
  const value = Number(score.score ?? score.relevance ?? score.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function buildRetrievalScorerFixture() {
  return {
    chunks: [
      {
        id: 'background-rag-latency',
        page: 1,
        sectionId: 'background',
        sectionLabel: 'Background',
        text: 'Baseline retrieval augmented generation runs the same number of retrieval calls for every user query.',
      },
      {
        id: 'method-adaptive-skipping',
        page: 4,
        sectionId: 'method',
        sectionLabel: 'Method',
        text: 'The method reduces retrieval cost by adaptively skipping low value retrieval steps while preserving answer quality.',
      },
      {
        id: 'baseline-results',
        page: 7,
        sectionId: 'results',
        sectionLabel: 'Results',
        text: 'The baseline accuracy is reported with latency measurements and ablation settings.',
      },
    ],
    expectedTopChunkId: 'method-adaptive-skipping',
    message: 'How does the method reduce retrieval cost?',
    queryTerms: ['method', 'reduce', 'retrieval', 'cost'],
    session: {
      id: 'retrieval-scorer-validation',
      title: 'Retrieval scorer validation fixture',
    },
  };
}

export function parseRetrievalValidationArgs(args = []) {
  return {
    expectedTopChunkId: readArg(args, '--expected-top-chunk-id', buildRetrievalScorerFixture().expectedTopChunkId),
    minTopScore: numberArg(args, '--min-top-score', DEFAULT_MIN_TOP_SCORE),
  };
}

export function summariseRetrievalScorerScores(scores = [], options = {}) {
  const ranked = (Array.isArray(scores) ? scores : [])
    .map((score) => ({
      chunkId: scoreId(score),
      score: scoreValue(score),
    }))
    .filter((score) => score.chunkId)
    .sort((left, right) => right.score - left.score);
  const top = ranked[0] || { chunkId: '', score: 0 };
  const expectedTopChunkId = String(options.expectedTopChunkId || '').trim();
  const minTopScore = Number.isFinite(Number(options.minTopScore)) ? Number(options.minTopScore) : DEFAULT_MIN_TOP_SCORE;
  const summary = {
    expectedTopChunkId,
    minTopScore,
    provider: String(options.provider || '').trim(),
    ranked,
    scoreCount: ranked.length,
    status: 'passed',
    topChunkId: top.chunkId,
    topScore: top.score,
  };
  const failures = validateRetrievalScorerSummary(summary);

  return {
    ...summary,
    failures,
    status: failures.length ? 'failed' : 'passed',
  };
}

export function validateRetrievalScorerSummary(summary = {}) {
  const failures = [];
  if (!summary.topChunkId) {
    failures.push('Expected at least one scored chunk.');
  }
  if (summary.expectedTopChunkId && summary.topChunkId && summary.topChunkId !== summary.expectedTopChunkId) {
    failures.push(`Expected top chunk ${summary.expectedTopChunkId}, received ${summary.topChunkId}.`);
  }
  if (Number(summary.topScore) < Number(summary.minTopScore)) {
    failures.push(`Expected top score >= ${summary.minTopScore}, received ${summary.topScore}.`);
  }
  return failures;
}

async function runValidation() {
  const options = parseRetrievalValidationArgs(process.argv.slice(2));
  const scorer = createConfiguredRetrievalScorer(process.env);
  if (!scorer) {
    console.error('ARES_RETRIEVAL_SCORER_URL is required for retrieval scorer validation.');
    process.exitCode = 2;
    return;
  }

  const fixture = buildRetrievalScorerFixture();
  const scores = await scorer.scoreChunks(fixture);
  const report = summariseRetrievalScorerScores(scores, {
    expectedTopChunkId: options.expectedTopChunkId,
    minTopScore: options.minTopScore,
    provider: scorer.provider,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runValidation();
}
