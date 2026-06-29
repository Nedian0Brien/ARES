function ensureText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function tokensFor(value) {
  return Array.from(new Set(ensureText(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []))
    .filter((token) => token.length > 1);
}

function objectText(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(objectText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(objectText).filter(Boolean).join(' ');
  }
  return '';
}

function latestQuestion(context = {}) {
  const messages = ensureArray(context.chatMessages);
  const userMessage = [...messages].reverse().find((message) => ensureText(message?.role || 'user') === 'user');
  return ensureText(userMessage?.text || context.question || context.input?.question);
}

function candidateFromEvidenceLink(item = {}) {
  const quote = ensureText(item.quote);
  const label = ensureText(item.title || item.label || item.sourceType || item.id);
  return {
    evidenceLinkId: ensureText(item.id),
    id: ensureText(item.id),
    label,
    locator: item.locator && typeof item.locator === 'object' ? { ...item.locator } : {},
    paperId: ensureText(item.paperId),
    quote,
    text: [label, quote, ensureText(item.sectionId)].filter(Boolean).join(' '),
    type: 'evidenceLink',
  };
}

function candidateFromReadingPacket(item = {}) {
  const label = ensureText(item.title || item.summary || item.id);
  const text = [
    label,
    ensureText(item.summary),
    objectText(item.keyPoints),
    objectText(item.sections),
    objectText(item.notes),
  ].filter(Boolean).join(' ');
  return {
    id: ensureText(item.id),
    label,
    paperId: ensureText(item.paperId),
    quote: ensureText(item.summary || objectText(item.keyPoints)),
    text,
    type: 'readingPacket',
  };
}

function candidateFromWikiPage(item = {}) {
  const label = ensureText(item.title || item.name || item.id);
  return {
    id: ensureText(item.id),
    label,
    quote: objectText(item.body).slice(0, 500),
    text: [label, objectText(item.body), objectText(item.tags)].filter(Boolean).join(' '),
    type: 'wikiPage',
  };
}

function candidateFromInsightNote(item = {}) {
  const label = ensureText(item.title || item.summary || item.id);
  return {
    id: ensureText(item.id),
    label,
    quote: ensureText(item.summary || item.body),
    text: [label, ensureText(item.summary), ensureText(item.body), objectText(item.tags)].filter(Boolean).join(' '),
    type: 'insightNote',
  };
}

function candidateFromPaper(item = {}) {
  const label = ensureText(item.title || item.paperId || item.id);
  return {
    id: ensureText(item.paperId || item.id),
    label,
    paperId: ensureText(item.paperId || item.id),
    quote: ensureText(item.abstract || item.summary),
    text: [label, ensureText(item.abstract), ensureText(item.summary), objectText(item.keywords)].filter(Boolean).join(' '),
    type: 'paper',
  };
}

function candidateFromReadingSession(item = {}) {
  const label = ensureText(item.title || item.paperTitle || item.paperId || item.id);
  return {
    id: ensureText(item.id),
    label,
    paperId: ensureText(item.paperId),
    quote: objectText(item.summaryCards).slice(0, 500),
    text: [label, objectText(item.summaryCards), objectText(item.sections), objectText(item.notes)].filter(Boolean).join(' '),
    type: 'readingSession',
  };
}

function collectCandidates(context = {}) {
  const collections = context.collections || {};
  return [
    ...ensureArray(collections.evidenceLinks).map(candidateFromEvidenceLink),
    ...ensureArray(collections.readingPackets).map(candidateFromReadingPacket),
    ...ensureArray(context.wikiPages || collections.wikiPages).map(candidateFromWikiPage),
    ...ensureArray(context.insightNotes || collections.insightNotes).map(candidateFromInsightNote),
    ...ensureArray(context.papers).map(candidateFromPaper),
    ...ensureArray(collections.readingSessions).map(candidateFromReadingSession),
  ].filter((candidate) => candidate.id && (candidate.text || candidate.quote || candidate.label));
}

const TYPE_PRIORITY = {
  evidenceLink: 6,
  readingPacket: 5,
  wikiPage: 4,
  insightNote: 3,
  paper: 2,
  readingSession: 1,
};

function scoreCandidate(candidate, queryTokens) {
  const candidateTokens = new Set(tokensFor([candidate.label, candidate.text, candidate.quote].join(' ')));
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap * 10 + (TYPE_PRIORITY[candidate.type] || 0);
}

export function selectAgentGroundingCandidates(context = {}, { limit = 6 } = {}) {
  const queryTokens = tokensFor(latestQuestion(context));
  const scored = collectCandidates(context)
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, queryTokens),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return ensureText(left.label).localeCompare(ensureText(right.label));
    });

  const matching = scored.filter((candidate) => candidate.score > (TYPE_PRIORITY[candidate.type] || 0));
  return (matching.length ? matching : scored).slice(0, Math.max(1, Number(limit) || 6));
}

export function createAgentGroundingScorer() {
  return {
    id: 'local-lexical',
    async checkHealth() {
      return {
        mode: 'local',
        ok: true,
        scorer: 'local-lexical',
      };
    },
    async score(context = {}, options = {}) {
      return {
        candidates: selectAgentGroundingCandidates(context, options),
        mode: 'local',
        ok: true,
        query: latestQuestion(context),
        scorer: 'local-lexical',
      };
    },
  };
}
