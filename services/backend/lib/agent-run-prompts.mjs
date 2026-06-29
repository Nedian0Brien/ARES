function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function serialiseJson(value) {
  return JSON.stringify(value, null, 2);
}

function searchContextSummary(context) {
  const query = String(context.searchQuery || '').trim() || context.project?.defaultQuery || 'untitled search';
  const scopes = ensureArray(context.searchScopes)
    .map((scope) => scope.label || scope.id)
    .filter(Boolean);

  return {
    query,
    scopeLabel: scopes.length ? scopes.join(', ') : 'project default scope',
  };
}

export function buildSearchPrompt({ context }) {
  const { query, scopeLabel } = searchContextSummary(context);
  const keywords = (context.project?.keywords || []).length
    ? context.project.keywords.map((keyword) => `- ${keyword}`).join('\n')
    : '- none';
  const scopes = ensureArray(context.searchScopes).length
    ? context.searchScopes.map((scope) => `- ${scope.type || 'scope'}: ${scope.label || scope.id}`).join('\n')
    : '- none';

  return `
You are the Scout agentic search planner for ARES.

Return only JSON:
{
  "outputSummary": "one concise sentence describing the live search plan"
}

Project:
- id: ${context.project?.id || 'unknown'}
- focus: ${context.project?.focus || 'n/a'}

Project keywords:
${keywords}

User query:
- ${query}

Active scopes:
${scopes}

Plan requirements:
- Treat this as an agentic literature-search run, not a keyword-only lookup.
- Mention the first live phase: Reader.
- Scope summary: ${scopeLabel}
- Keep the sentence short enough for a status badge or run header.
  `.trim();
}

export function buildChatPrompt({ context }) {
  return `
You are the Agent chat runtime for ARES.

Task:
- Answer the latest user message using only the provided project context.
- Prefer the selected Grounding candidates when citing evidence.
- Do not mutate files, run shell commands, or create user assets.
- Return only JSON.

Project:
${serialiseJson({
    focus: context.project?.focus,
    id: context.project?.id,
    keywords: context.project?.keywords,
    name: context.project?.name,
  })}

Thread:
${serialiseJson(context.chatThread || {})}

Messages:
${serialiseJson(context.chatMessages || [])}

Grounding:
${serialiseJson(context.grounding || { candidates: [], ok: false, scorer: 'none' })}

Available context:
${serialiseJson({
    evidenceLinks: context.collections?.evidenceLinks || [],
    insightNotes: context.insightNotes || [],
    papers: context.papers || [],
    readingPackets: context.collections?.readingPackets || [],
    readingSessions: context.collections?.readingSessions || [],
    wikiPages: context.wikiPages || [],
  })}

Return shape:
{
  "answer": "string",
  "citations": [{ "evidenceLinkId": "string", "label": "string", "locator": { "page": 1 }, "quote": "string" }],
  "outputSummary": "string"
}
`.trim();
}

export function buildReadingPrompt({ context }) {
  const { paper, project } = context;

  return `
You are the Reader agent for ARES.

Task:
- Build a structured reading session for the paper below.
- Do not use shell commands.
- Return JSON only.

Project:
${serialiseJson({
    focus: project.focus,
    id: project.id,
    keywords: project.keywords,
    name: project.name,
  })}

Paper:
${serialiseJson(paper)}

Return shape:
{
  "readingSessions": [
    {
      "summary": "string",
      "sections": [{ "id": "abstract", "label": "Abstract", "status": "done|queue|todo", "summary": "string" }],
      "highlights": [{ "id": "string", "type": "claim|method|result|limit", "section": "string", "text": "string" }],
      "reproParams": [{ "label": "string", "value": "string" }],
      "notes": [{ "id": "string", "label": "string", "value": "string" }]
    }
  ],
  "outputSummary": "string"
}
`.trim();
}

export function buildResearchPrompt({ context }) {
  const { handoff, paper, project, readingSession } = context;

  return `
You are the Reproduction agent for ARES.

Task:
- Produce graph-ready Lab assets: a reproduction plan, initial experiment runs, and a result dossier shell.
- Shell access is allowed if needed, but keep the response as JSON only.

Project:
${serialiseJson({
    focus: project.focus,
    id: project.id,
    keywords: project.keywords,
    name: project.name,
  })}

Paper:
${serialiseJson(paper)}

Reading session:
${serialiseJson(readingSession || {})}

Reading handoff:
${serialiseJson(handoff || {})}

Return shape:
{
  "reproductionPlans": [{
    "title": "string",
    "status": "draft|todo|queue|running|done",
    "checklist": [{ "title": "string", "detail": "string", "status": "todo|queue|running|done" }],
    "commands": ["python scripts/run_baseline.py"],
    "datasets": ["string"],
    "metrics": ["string"]
  }],
  "experimentRuns": [{
    "title": "string",
    "kind": "baseline|ablation|sweep",
    "status": "draft|todo|queue|running|done",
    "config": { "command": { "command": "string", "args": ["string"], "expectedMetrics": ["string"] } },
    "metrics": {}
  }],
  "resultDossiers": [{
    "title": "string",
    "status": "draft|todo|queue|running|done",
    "comparisons": [{ "metric": "string", "target": "string" }],
    "deltaSummary": "string"
  }],
  "outputSummary": "string"
}
`.trim();
}

export function buildResultPrompt({ context }) {
  return `
You are the Analyst report agent for ARES.

Task:
- Compare reproduced evidence with the original paper claims.
- Return JSON only.

Context:
${serialiseJson({
    experimentRuns: context.experimentRuns || [],
    paper: context.paper,
    readingSession: context.readingSession || null,
  })}

Return shape:
{
  "resultComparisons": [{ "title": "string", "metric": "string", "paperValue": "string", "reproducedValue": "string", "delta": "string", "summary": "string", "status": "todo|queue|running|done" }],
  "outputSummary": "string"
}
`.trim();
}

export function buildInsightPrompt({ context }) {
  return `
You are the Analyst agent for ARES.

Task:
- Write a concise insight note grounded in the available comparisons.
- Return JSON only.

Context:
${serialiseJson({
    paper: context.paper,
    resultComparisons: context.resultComparisons || [],
  })}

Return shape:
{
  "insightNotes": [{ "title": "string", "summary": "string", "hypothesis": "string", "validationState": "string", "status": "todo|queue|running|done" }],
  "outputSummary": "string"
}
`.trim();
}

export function buildWritingPrompt({ context }) {
  return `
You are the Writing agent for ARES.

Task:
- Create a concise research draft from the upstream assets.
- Return JSON only.

Context:
${serialiseJson({
    insightNotes: context.insightNotes || [],
    paper: context.paper,
    readingSession: context.readingSession || null,
    resultComparisons: context.resultComparisons || [],
  })}

Return shape:
{
  "writingDrafts": [{
    "title": "string",
    "summary": "string",
    "status": "todo|queue|running|done",
    "sections": [{ "id": "string", "label": "string", "text": "string" }]
  }],
  "outputSummary": "string"
}
`.trim();
}
