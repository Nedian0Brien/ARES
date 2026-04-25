import path from 'node:path';
import { promises as fs } from 'node:fs';

import { PDFParse } from 'pdf-parse';

import { createAgentRuntime, DEFAULT_AGENT_TIMEOUT_MS } from './agent-runtime.mjs';
import {
  buildReadingSessionSeed,
  normaliseReadingSession,
  nowIso,
} from './reading-model.mjs';

const READING_RUNTIME_DIR = path.join('data', 'runtime', 'reading');
const DEMO_PDF_HOST = 'example.org';
const MAX_CHAT_CHUNKS = 4;

function ensureString(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function ensureTrimmedString(value, fallback = '') {
  const text = ensureString(value, fallback).trim();
  return text || fallback;
}

function clipText(value, limit = 320) {
  const text = ensureTrimmedString(value, '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(limit - 1, 1)).trimEnd()}…`;
}

function firstSentence(value, fallback = '') {
  const text = clipText(value, 500);
  if (!text) {
    return fallback;
  }

  const match = text.match(/^(.{0,260}?[.!?])(?:\s|$)/);
  return match ? match[1] : text;
}

function tokenize(value) {
  return ensureTrimmedString(value, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function wrapText(value, width = 78) {
  const words = ensureTrimmedString(value, '').split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [''];
  }

  const lines = [];
  let current = words.shift() || '';

  for (const word of words) {
    const next = `${current} ${word}`;
    if (next.length <= width) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  lines.push(current);
  return lines;
}

function escapePdfText(value) {
  return ensureString(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function buildSimplePdfBuffer(pages) {
  const objects = [null, null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pageIds = [];

  for (const pageLines of pages) {
    const contentLines = [
      'BT',
      '/F1 11 Tf',
      '14 TL',
      '64 740 Td',
    ];

    pageLines.forEach((line, index) => {
      const escaped = escapePdfText(line);
      contentLines.push(`(${escaped}) Tj`);
      if (index < pageLines.length - 1) {
        contentLines.push('T*');
      }
    });

    contentLines.push('ET');
    const stream = contentLines.join('\n');
    const streamObject = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
    objects.push(streamObject);
    const contentId = objects.length;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(objects.length);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';

  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let cursor = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(cursor);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    cursor += chunk.length;
  });

  const xrefOffset = cursor;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (let index = 1; index < offsets.length; index += 1) {
    chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join(''), 'utf8');
}

function buildDemoPdfPages(session) {
  const title = ensureTrimmedString(session.title, 'ARES Reading Session');
  const authors = Array.isArray(session.authors) && session.authors.length ? session.authors.join(', ') : 'ARES Reader';
  const venue = [session.venue || 'Unknown venue', session.year || 'n/a'].filter(Boolean).join(' · ');
  const abstract = ensureTrimmedString(
    session.abstract || session.summary,
    `${title} is prepared as a fallback reading session for the demo workspace.`,
  );
  const keyPoints = Array.isArray(session.keyPoints) && session.keyPoints.length
    ? session.keyPoints
    : [
        'Adaptive skipping reduces reranker cost while preserving answer quality.',
        'The method uses a confidence gate before invoking an expensive cross-encoder.',
        'The main trade-off is sensitivity to calibration on hard examples.',
      ];
  const keywordLine = `Keywords: ${(session.keywords || session.matchedKeywords || []).slice(0, 6).join(', ') || 'reading, retrieval, demo'}`;

  return [
    [
      title,
      authors,
      venue || 'ARES Demo PDF',
      '',
      'Abstract',
      ...wrapText(abstract, 76),
      '',
      '1 Introduction',
      ...wrapText(firstSentence(keyPoints[0], abstract), 76),
      ...wrapText('This demo PDF is generated locally so the Reading pipeline can exercise cache, parse, summary, and viewer flows without depending on external hosts.', 76),
      keywordLine,
    ],
    [
      '2 Method',
      ...wrapText(firstSentence(keyPoints[1], abstract), 76),
      ...wrapText('The workflow caches the PDF, extracts page-level text, detects section boundaries, and stores reusable chunks for retrieval-based reader chat.', 76),
      '',
      '3 Results',
      ...wrapText(firstSentence(keyPoints[2], abstract), 76),
      'Figure 1. Adaptive skip policy overview.',
      ...wrapText('The policy estimates confidence, decides whether to trigger reranking, and records the supporting evidence for later inspection.', 76),
    ],
    [
      '4 Limitations',
      ...wrapText('Scanned image-only PDFs are rejected in v1 because the pipeline requires an extractable text layer. OCR is intentionally out of scope for this milestone.', 76),
      '',
      '5 Reproducibility',
      ...wrapText('Key implementation parameters and follow-up notes are seeded during parse so Research can inherit them without a separate handoff format.', 76),
      '',
      'Table 1. Efficiency comparison.',
      'System      Latency(ms)      Quality',
      'Baseline    120              84.1',
      'Adaptive     78              83.8',
    ],
  ];
}

function createDemoPdfBuffer(session) {
  return buildSimplePdfBuffer(buildDemoPdfPages(session));
}

function buildSessionRelativePath(sessionId, fileName) {
  return path.join(READING_RUNTIME_DIR, sessionId, fileName).replaceAll('\\', '/');
}

function resolveSafePath(rootDir, relativePath) {
  const next = path.resolve(rootDir, relativePath);
  const safeRoot = path.resolve(rootDir);
  if (!next.startsWith(safeRoot)) {
    throw new Error('Unsafe runtime path requested.');
  }

  return next;
}

function buildChunkId(page, index) {
  return `chunk-p${page}-${index + 1}`;
}

function detectHeading(line) {
  const text = ensureTrimmedString(line, '');
  if (!text) {
    return false;
  }

  if (/^(abstract|references)$/i.test(text)) {
    return true;
  }

  if (/^\d+(\.\d+)?\s+[A-Z]/.test(text)) {
    return true;
  }

  return /^[A-Z][A-Za-z0-9\s/-]{2,48}$/.test(text) && text === text.trim();
}

function extractSectionLabel(line) {
  const text = ensureTrimmedString(line, '');
  if (!text) {
    return '';
  }

  if (/^abstract$/i.test(text)) {
    return 'Abstract';
  }

  return text;
}

function buildSectionsFromPages(pages, session) {
  const sections = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    const body = current.lines.join(' ').trim();
    sections.push({
      id:
        current.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || `section-${sections.length + 1}`,
      label: current.label,
      order: sections.length,
      pageEnd: current.pageEnd,
      pageStart: current.pageStart,
      status: 'done',
      summary: firstSentence(body, current.label),
    });
    current = null;
  };

  for (const page of pages) {
    const lines = ensureTrimmedString(page.text, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      continue;
    }

    for (const line of lines) {
      if (detectHeading(line)) {
        pushCurrent();
        current = {
          label: extractSectionLabel(line),
          lines: [],
          pageEnd: page.num,
          pageStart: page.num,
        };
        continue;
      }

      if (!current) {
        current = {
          label: sections.length ? `Section ${sections.length + 1}` : 'Abstract',
          lines: [],
          pageEnd: page.num,
          pageStart: page.num,
        };
      }

      current.lines.push(line);
      current.pageEnd = page.num;
    }
  }

  pushCurrent();

  if (sections.length) {
    return sections;
  }

  return [
    {
      id: 'abstract',
      label: 'Abstract',
      order: 0,
      pageEnd: 1,
      pageStart: 1,
      status: 'done',
      summary: firstSentence(session.abstract || session.summary, 'Abstract'),
    },
  ];
}

function buildChunksFromPages(pages, sections) {
  const chunks = [];
  let sectionIndex = 0;

  for (const page of pages) {
    while (
      sectionIndex < sections.length - 1 &&
      sections[sectionIndex + 1].pageStart !== null &&
      page.num >= sections[sectionIndex + 1].pageStart
    ) {
      sectionIndex += 1;
    }

    const section = sections[sectionIndex] || sections[0] || null;
    const paragraphs = ensureTrimmedString(page.text, '')
      .split(/\n\s*\n+/)
      .map((block) => block.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const source = paragraphs.length ? paragraphs : ensureTrimmedString(page.text, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    source.forEach((text, index) => {
      chunks.push({
        id: buildChunkId(page.num, index),
        page: page.num,
        sectionId: section?.id || '',
        sectionLabel: section?.label || '',
        terms: tokenize(text),
        text,
      });
    });
  }

  return chunks;
}

function pickSectionByName(sections, pattern) {
  return sections.find((section) => pattern.test(section.label || section.id || '')) || null;
}

function buildHighlights(sections, chunks, session) {
  const scoredChunks = chunks
    .map((chunk) => ({
      ...chunk,
      quality:
        tokenize(chunk.text).length +
        (/figure|table|result|method|approach|evaluation|limitation/i.test(chunk.text || '') ? 6 : 0),
    }))
    .sort((left, right) => right.quality - left.quality);
  const candidates = [
    { type: 'claim', section: sections[0] || null },
    { type: 'method', section: pickSectionByName(sections, /method|approach|setup|model/i) || sections[1] || sections[0] || null },
    { type: 'result', section: pickSectionByName(sections, /result|experiment|evaluation/i) || sections[2] || sections[0] || null },
    { type: 'limit', section: pickSectionByName(sections, /limit|discussion|conclusion/i) || sections.at(-1) || sections[0] || null },
  ];

  return candidates
    .map((entry, index) => {
      const chunk =
        scoredChunks.find((item) => item.sectionId === entry.section?.id && item.quality >= 12) ||
        scoredChunks.find((item) => item.sectionId === entry.section?.id) ||
        scoredChunks[index] ||
        chunks[index] ||
        null;
      const text = clipText(chunk?.text || entry.section?.summary || session.summary || session.abstract, 320);
      if (!text) {
        return null;
      }

      return {
        id: `highlight-${index + 1}`,
        page: chunk?.page || entry.section?.pageStart || 1,
        quote: text,
        sectionId: entry.section?.id || '',
        text,
        type: entry.type,
      };
    })
    .filter(Boolean);
}

function buildSeedNotes(highlights, existingNotes = []) {
  if (Array.isArray(existingNotes) && existingNotes.length) {
    return existingNotes;
  }

  const timestamp = nowIso();
  return highlights.map((highlight, index) => ({
    body: index === 0 ? '핵심 주장과 후속 검증 포인트를 정리합니다.' : '',
    createdAt: timestamp,
    id: `note-seed-${index + 1}`,
    kind: highlight.type === 'claim' ? 'summary' : 'note',
    origin: 'highlight',
    page: highlight.page,
    quote: highlight.quote || highlight.text,
    sectionId: highlight.sectionId || '',
    sourceHighlightId: highlight.id,
    updatedAt: timestamp,
  }));
}

function buildReproParams(session, sections) {
  const params = [];
  const methodSection = pickSectionByName(sections, /method|approach|setup/i);
  const resultSection = pickSectionByName(sections, /result|evaluation|experiment/i);

  params.push({
    id: 'param-paper',
    label: 'Paper title',
    value: ensureTrimmedString(session.title, 'Untitled paper'),
  });

  if (methodSection?.summary) {
    params.push({
      id: 'param-method',
      label: 'Method focus',
      value: methodSection.summary,
    });
  }

  if (resultSection?.summary) {
    params.push({
      id: 'param-result',
      label: 'Result snapshot',
      value: resultSection.summary,
    });
  }

  return params;
}

function findCaptionLines(pageText, kind) {
  const regex = kind === 'table' ? /^table\s+(\d+)\.\s*(.+)$/i : /^figure\s+(\d+)\.\s*(.+)$/i;
  return ensureTrimmedString(pageText, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(regex);
      if (!match) {
        return null;
      }

      return {
        caption: clipText(`${kind === 'table' ? 'Table' : 'Figure'} ${match[1]}. ${match[2]}`, 180),
        number: Number(match[1]) || 1,
      };
    })
    .filter(Boolean);
}

function buildFigureSvg(caption) {
  const safeCaption = clipText(caption, 100).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540" viewBox="0 0 720 540">
  <rect width="720" height="540" rx="28" fill="#f7f7f6"/>
  <rect x="54" y="60" width="612" height="320" rx="24" fill="#ffffff" stroke="#d4d4d2"/>
  <circle cx="176" cy="186" r="44" fill="#5e6ad2" opacity="0.12"/>
  <path d="M132 298c58-68 118-104 180-108 63-4 126 30 194 102" fill="none" stroke="#5e6ad2" stroke-width="18" stroke-linecap="round"/>
  <path d="M184 242l64-62 74 60 116-120" fill="none" stroke="#3aa3a3" stroke-width="12" stroke-linecap="round"/>
  <text x="72" y="434" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="600" fill="#0a0a0b">${safeCaption}</text>
  <text x="72" y="478" font-family="JetBrains Mono, monospace" font-size="20" fill="#8a8a92">ARES Reading asset preview</text>
</svg>`;
}

function inferTableRows(pageText) {
  return ensureTrimmedString(pageText, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\s{2,}/.test(line))
    .map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length >= 2);
}

function summariseFromSections(sections, session) {
  const abstractSection = pickSectionByName(sections, /abstract/i) || sections[0] || null;
  const methodSection = pickSectionByName(sections, /method|approach|setup/i) || sections[1] || abstractSection;
  const resultSection = pickSectionByName(sections, /result|experiment|evaluation/i) || sections[2] || abstractSection;
  const limitSection = pickSectionByName(sections, /limit|discussion|conclusion/i) || sections.at(-1) || abstractSection;
  const keyPoints = [
    abstractSection?.summary,
    methodSection?.summary,
    resultSection?.summary,
    limitSection?.summary,
  ]
    .map((entry) => clipText(entry, 200))
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index)
    .slice(0, 4);

  return {
    keyPoints,
    limit: clipText(limitSection?.summary || session.warning || session.summary, 320),
    method: clipText(methodSection?.summary || session.summary, 320),
    result: clipText(resultSection?.summary || session.summary, 320),
    sectionSummaries: sections.map((section) => ({
      id: `section-summary-${section.id}`,
      label: section.label,
      page: section.pageStart || null,
      sectionId: section.id,
      summary: clipText(section.summary, 260),
    })),
    tldr: clipText(session.summary || session.abstract || abstractSection?.summary, 320),
  };
}

function scoreChunk(queryTerms, chunk, { message = '', note = null } = {}) {
  if (!queryTerms.length) {
    return 0;
  }

  const bag = new Map();
  for (const token of chunk.terms || []) {
    bag.set(token, (bag.get(token) || 0) + 1);
  }

  const lexical = queryTerms.reduce((score, token) => score + (bag.get(token) || 0), 0);
  const text = ensureTrimmedString(chunk.text, '').toLowerCase();
  const phrase = ensureTrimmedString(message, '').toLowerCase();
  const phraseBoost = phrase.length >= 12 && text.includes(phrase.slice(0, 80)) ? 8 : 0;
  const noteSectionBoost = note?.sectionId && note.sectionId === chunk.sectionId ? 6 : 0;
  const notePageBoost = note?.page && Number(note.page) === Number(chunk.page) ? 4 : 0;
  const titleBoost = /method|result|limit|claim|contribution|experiment|evaluation/i.test(chunk.sectionLabel || '') ? 2 : 0;
  return lexical + phraseBoost + noteSectionBoost + notePageBoost + titleBoost;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createReadingService({
  agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
  agentRuntime = null,
  fetchImpl = globalThis.fetch,
  pdfParseFactory = (options) => new PDFParse(options),
  rootDir,
  runtimeName = 'codex',
  store,
} = {}) {
  if (!rootDir) {
    throw new Error('rootDir is required to create the reading service.');
  }

  if (!store) {
    throw new Error('store is required to create the reading service.');
  }

  const runtime =
    agentRuntime ||
    createAgentRuntime({
      cwd: rootDir,
      runtimeName,
    });

  let runtimeAvailablePromise = null;

  async function isRuntimeAvailable() {
    if (!runtimeAvailablePromise) {
      runtimeAvailablePromise = runtime.checkAvailability().catch(() => false);
    }

    return runtimeAvailablePromise;
  }

  async function getSessionOrThrow(sessionId) {
    const session = store.getReadingSession(sessionId);
    if (!session) {
      throw new Error(`Unknown reading session: ${sessionId}`);
    }

    return normaliseReadingSession(session);
  }

  async function ensureSessionDir(sessionId) {
    const directory = resolveSafePath(rootDir, buildSessionRelativePath(sessionId, ''));
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }

  async function readParsedArtifact(session) {
    const relativePath = ensureTrimmedString(session.parsedArtifactPath, '');
    if (!relativePath) {
      return null;
    }

    const filePath = resolveSafePath(rootDir, relativePath);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  }

  async function writeParsedArtifact(sessionId, artifact) {
    await ensureSessionDir(sessionId);
    const relativePath = buildSessionRelativePath(sessionId, 'parsed-artifact.json');
    const filePath = resolveSafePath(rootDir, relativePath);
    await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return relativePath;
  }

  async function writeJsonAsset(sessionId, name, payload) {
    await ensureSessionDir(sessionId);
    const relativePath = buildSessionRelativePath(sessionId, name);
    const filePath = resolveSafePath(rootDir, relativePath);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return relativePath;
  }

  async function writeTextAsset(sessionId, name, payload) {
    await ensureSessionDir(sessionId);
    const relativePath = buildSessionRelativePath(sessionId, name);
    const filePath = resolveSafePath(rootDir, relativePath);
    await fs.writeFile(filePath, payload, 'utf8');
    return relativePath;
  }

  async function writeBinaryAsset(sessionId, name, payload) {
    await ensureSessionDir(sessionId);
    const relativePath = buildSessionRelativePath(sessionId, name);
    const filePath = resolveSafePath(rootDir, relativePath);
    await fs.writeFile(filePath, payload);
    return relativePath;
  }

  function buildDemoPdfForSession(session) {
    return createDemoPdfBuffer(session);
  }

  async function fetchPdfBuffer(session) {
    const pdfUrl = ensureTrimmedString(session.pdfUrl, '');
    if (!pdfUrl) {
      throw new Error('PDF URL is not available for this reading session.');
    }

    try {
      const parsed = new URL(pdfUrl);
      if (parsed.hostname === DEMO_PDF_HOST) {
        return buildDemoPdfForSession(session);
      }
    } catch {
      // Continue to network fetch for non-URL strings.
    }

    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is unavailable for PDF download.');
    }

    const response = await fetchImpl(pdfUrl);
    if (!response?.ok) {
      throw new Error(`Failed to download PDF (${response?.status || 'unknown status'}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async function ensurePdfCached(session) {
    const cachedRelativePath = ensureTrimmedString(session.pdfCachePath, '');
    if (cachedRelativePath) {
      const cachedPath = resolveSafePath(rootDir, cachedRelativePath);
      if (await fileExists(cachedPath)) {
        return {
          buffer: await fs.readFile(cachedPath),
          cachePath: cachedRelativePath,
        };
      }
    }

    const buffer = await fetchPdfBuffer(session);
    const relativePath = buildSessionRelativePath(session.id, 'source.pdf');
    const filePath = resolveSafePath(rootDir, relativePath);
    await ensureSessionDir(session.id);
    await fs.writeFile(filePath, buffer);

    const nextSession = await store.upsertReadingSession(
      normaliseReadingSession(
        {
          ...session,
          pdfCachePath: relativePath,
        },
        { existing: session },
      ),
    );

    return {
      buffer,
      cachePath: nextSession.pdfCachePath,
      session: normaliseReadingSession(nextSession),
    };
  }

  async function updateSession(sessionId, patch) {
    const current = await getSessionOrThrow(sessionId);
    const next = normaliseReadingSession(
      {
        ...patch,
        id: current.id,
        paperId: current.paperId,
        projectId: current.projectId,
      },
      { existing: current },
    );
    return normaliseReadingSession(await store.upsertReadingSession(next));
  }

  async function buildAssetsFromArtifact(sessionId, artifact) {
    const assets = [];
    const figureCandidates = [];
    const tableCandidates = [];

    for (const page of artifact.pages || []) {
      const figures = findCaptionLines(page.text, 'figure');
      const tables = findCaptionLines(page.text, 'table');
      figures.forEach((entry) => figureCandidates.push({ ...entry, page: page.num }));
      tables.forEach((entry) => tableCandidates.push({ ...entry, page: page.num }));
    }

    for (const figure of figureCandidates) {
      const thumbPath = await writeTextAsset(sessionId, `figure-${figure.number}.svg`, buildFigureSvg(figure.caption));
      assets.push({
        caption: figure.caption,
        id: `figure-${figure.number}`,
        kind: 'figure',
        number: figure.number,
        page: figure.page,
        thumbPath,
      });
    }

    if (artifact.imagePages?.length) {
      for (const page of artifact.imagePages) {
        for (const image of page.images || []) {
          const fileName = image.name || `figure-${assets.length + 1}.png`;
          const thumbPath = await writeBinaryAsset(sessionId, fileName, Buffer.from(image.data));
          assets.push({
            caption: clipText(image.name || `Figure ${assets.length + 1}`, 160),
            id: `figure-${assets.length + 1}`,
            kind: 'figure',
            number: assets.filter((asset) => asset.kind === 'figure').length + 1,
            page: page.num || page.pageNumber || 1,
            thumbPath,
          });
        }
      }
    }

    const tablePages = artifact.tablePages || [];
    if (tablePages.length) {
      for (const page of tablePages) {
        for (let index = 0; index < (page.tables || []).length; index += 1) {
          const rows = page.tables[index];
          const caption = tableCandidates.find((entry) => entry.page === page.num)?.caption || `Table ${index + 1}`;
          const number = tableCandidates.find((entry) => entry.page === page.num)?.number || index + 1;
          const dataPath = await writeJsonAsset(sessionId, `table-${page.num}-${index + 1}.json`, rows);
          assets.push({
            caption,
            dataPath,
            id: `table-${page.num}-${index + 1}`,
            kind: 'table',
            number,
            page: page.num,
            rows,
          });
        }
      }
    }

    if (!tablePages.length) {
      for (const page of artifact.pages || []) {
        const rows = inferTableRows(page.text);
        if (!rows.length) {
          continue;
        }

        const meta = tableCandidates.find((entry) => entry.page === page.num) || {
          caption: `Table ${assets.filter((asset) => asset.kind === 'table').length + 1}`,
          number: assets.filter((asset) => asset.kind === 'table').length + 1,
        };
        const dataPath = await writeJsonAsset(sessionId, `table-${page.num}.json`, rows);
        assets.push({
          caption: meta.caption,
          dataPath,
          id: `table-${page.num}`,
          kind: 'table',
          number: meta.number,
          page: page.num,
          rows,
        });
      }
    }

    return assets;
  }

  function buildChatFallback({ chunks, message, summaryCards }) {
    const supporting = chunks.map((chunk) => chunk.text).join(' ');
    if (!supporting) {
      return {
        answer: '관련 본문 근거를 충분히 찾지 못했습니다. 질문을 더 구체화하거나 PDF의 해당 섹션을 먼저 확인해 주세요.',
        citations: [],
        question: message,
      };
    }

    const answerBase = supporting || summaryCards?.tldr || '관련 본문이 충분하지 않아 세션 요약을 기준으로 답변합니다.';
    return {
      answer: clipText(answerBase, 420),
      citations: chunks.map((chunk) => ({
        label: chunk.sectionLabel || chunk.sectionId || `Page ${chunk.page}`,
        page: chunk.page,
        quote: clipText(chunk.text, 220),
        sectionId: chunk.sectionId || '',
      })),
      question: message,
    };
  }

  async function runRuntimeJsonTask(prompt, fallbackBuilder, { fallbackOnFailure = true } = {}) {
    if (!(await isRuntimeAvailable())) {
      if (!fallbackOnFailure) {
        return {
          payload: null,
          provenance: {
            fallbackReason: 'agent runtime unavailable',
            generatedBy: '',
            runtimeUsed: false,
          },
        };
      }

      return {
        payload: fallbackBuilder(),
        provenance: {
          fallbackReason: 'agent runtime unavailable',
          generatedBy: 'fallback',
          runtimeUsed: false,
        },
      };
    }

    try {
      const summary = await runtime.runJsonTask({
        prompt,
        sandbox: 'read-only',
        timeoutMs: agentTimeoutMs,
      });
      return {
        payload: runtime.parseJsonFromMessages(summary),
        provenance: {
          fallbackReason: '',
          generatedBy: 'agent-runtime',
          runtimeUsed: true,
        },
      };
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : String(error);
      if (!fallbackOnFailure) {
        return {
          payload: null,
          provenance: {
            fallbackReason,
            generatedBy: '',
            runtimeUsed: false,
          },
        };
      }

      return {
        payload: fallbackBuilder(),
        provenance: {
          fallbackReason,
          generatedBy: 'fallback',
          runtimeUsed: false,
        },
      };
    }
  }

  function buildSummaryPrompt(session, artifact) {
    const sectionContext = (artifact.sections || [])
      .slice(0, 8)
      .map((section) => `- ${section.label} (p.${section.pageStart || '?'}) ${section.summary}`)
      .join('\n');
    const chunkContext = (artifact.chunks || [])
      .slice(0, 10)
      .map((chunk) => `- [p.${chunk.page}] ${chunk.text}`)
      .join('\n');

    return `
Return JSON only with keys: tldr, keyPoints, method, result, limit, sectionSummaries.

Paper title: ${session.title}
Abstract: ${session.abstract}
Existing summary: ${session.summary}

Sections:
${sectionContext}

Evidence:
${chunkContext}

Rules:
- Keep tldr, method, result, limit under 240 characters each.
- keyPoints must be an array of 3 or 4 concise strings.
- sectionSummaries must be an array of objects with sectionId, label, page, summary.
`.trim();
  }

  function normaliseChatSelection(value) {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const quote = clipText(ensureTrimmedString(value.quote, ''), 900);
    if (!quote) {
      return null;
    }

    const page = value.page === undefined || value.page === null || value.page === '' ? null : Number(value.page) || null;
    const lineCount =
      value.lineCount === undefined || value.lineCount === null || value.lineCount === ''
        ? null
        : Math.max(1, Math.round(Number(value.lineCount) || 1));
    return { lineCount, page, quote };
  }

  function buildChatPrompt(session, summaryCards, message, chunks, note, selection) {
    const context = chunks
      .map((chunk) => `- [${chunk.sectionLabel || chunk.sectionId || `Page ${chunk.page}`}] p.${chunk.page}: ${chunk.text}`)
      .join('\n');
    const noteContext = note
      ? `Focused note:\n- quote: ${note.quote || ''}\n- body: ${note.body || ''}\n- page: ${note.page || ''}\n`
      : '';
    const selectionContext = selection
      ? `Primary selected PDF text (treat this as the active user-selected passage):\n- quote: ${selection.quote}\n- page: ${selection.page || ''}\n- lines: ${selection.lineCount || ''}\n`
      : '';

    return `
Return JSON only with keys: answer, citations.

Paper title: ${session.title}
TLDR: ${summaryCards?.tldr || session.summary || session.abstract}
User question: ${message}
${noteContext}
${selectionContext}
Relevant chunks:
${context}

Rules:
- answer should directly answer the question using the provided evidence.
- If selected PDF text is present, prioritize that passage over the retrieved chunks.
- For requests like "translate this", "이 내용 번역", "selected text", or "선택한 부분", answer about the selected passage itself.
- When translating, translate the selected quote faithfully and do not substitute nearby chunks.
- citations must be an array of objects with label, page, quote, sectionId.
- Do not invent unsupported claims.
`.trim();
  }

  return {
    async listProjectSessions(projectId) {
      return store.getReadingSessions(projectId).map((session) => normaliseReadingSession(session));
    },

    async createSession({ paper, projectId, runId = '', status = 'todo', summary = '' } = {}) {
      if (!paper) {
        throw new Error('paper is required to create a reading session.');
      }

      const existing = store.getReadingSessionByPaper(projectId, paper.paperId);
      const seed = buildReadingSessionSeed(projectId, paper, {
        runId,
        status,
        summary: summary || paper.summary || paper.abstract || '',
      });
      const session = await store.upsertReadingSession(normaliseReadingSession(seed, { existing }));
      await store.queuePaper(projectId, paper, {
        runId: session.runId,
        sessionId: session.id,
        status: session.status,
      });
      return normaliseReadingSession(session);
    },

    async getSession(sessionId) {
      return getSessionOrThrow(sessionId);
    },

    async getSessionPdf(sessionId) {
      const session = await getSessionOrThrow(sessionId);
      const payload = await ensurePdfCached(session);
      return {
        buffer: payload.buffer,
        session: payload.session || session,
      };
    },

    async parseSession(sessionId) {
      const initial = await updateSession(sessionId, {
        parseError: '',
        parseFinishedAt: null,
        parseStartedAt: nowIso(),
        parseStatus: 'running',
        status: 'running',
      });

      try {
        if (!initial.pdfUrl) {
          const failed = await updateSession(sessionId, {
            parseError: 'PDF URL is not available for this paper.',
            parseFinishedAt: nowIso(),
            parseStatus: 'error',
          });
          return { session: failed };
        }

        const cached = await ensurePdfCached(initial);
        const parser = pdfParseFactory({ data: cached.buffer });
        const [textResult, infoResult, tableResult, imageResult] = await Promise.all([
          parser.getText({ parsePageInfo: true }).catch(() => ({ pages: [], text: '', total: 0 })),
          parser.getInfo({ parsePageInfo: true }).catch(() => ({ pages: [], total: 0 })),
          parser.getTable().catch(() => ({ pages: [], total: 0 })),
          parser.getImage().catch(() => ({ pages: [], total: 0 })),
        ]);
        await parser.destroy?.();

        const pages = (textResult.pages || [])
          .map((page) => ({
            num: Number(page.num) || 1,
            text: ensureTrimmedString(page.text, ''),
          }))
          .filter((page) => page.text);

        if (!pages.length || !ensureTrimmedString(textResult.text, '')) {
          const failed = await updateSession(sessionId, {
            parseError: 'This PDF does not expose a usable text layer. OCR is not supported in v1.',
            parseFinishedAt: nowIso(),
            parseStatus: 'error',
            pageCount: Number(infoResult.total || textResult.total) || null,
          });
          return { session: failed };
        }

        const pageCount = Number(infoResult.total || textResult.total) || pages.length;
        const sections = buildSectionsFromPages(pages, initial);
        const chunks = buildChunksFromPages(pages, sections);
        const highlights = buildHighlights(sections, chunks, initial);
        const notes = buildSeedNotes(highlights, initial.notes);
        const reproParams = buildReproParams(initial, sections);
        const artifact = {
          chunks,
          createdAt: nowIso(),
          imagePages: imageResult.pages || [],
          pageCount,
          pages,
          sections,
          tablePages: tableResult.pages || [],
        };
        const parsedArtifactPath = await writeParsedArtifact(sessionId, artifact);
        const assets = await buildAssetsFromArtifact(sessionId, artifact);
        const summaryCards = summariseFromSections(sections, initial);

        const session = await updateSession(sessionId, {
          assets,
          highlights,
          notes,
          pageCount,
          parsedArtifactPath,
          parseError: '',
          parseFinishedAt: nowIso(),
          parseStatus: 'done',
          reproParams,
          sections,
          summaryCards,
        });

        return {
          artifact,
          session,
        };
      } catch (error) {
        const failed = await updateSession(sessionId, {
          parseError: error instanceof Error ? error.message : String(error),
          parseFinishedAt: nowIso(),
          parseStatus: 'error',
        });
        return { session: failed };
      }
    },

    async summarizeSession(sessionId) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Parse paper must complete before summarize.');
      }

      const running = await updateSession(sessionId, {
        summaryError: '',
        summaryFinishedAt: null,
        summaryStartedAt: nowIso(),
        summaryStatus: 'running',
      });
      const artifact = await readParsedArtifact(running);
      if (!artifact) {
        throw new Error('Parsed artifact is missing for this session.');
      }

      const fallback = () => summariseFromSections(artifact.sections || [], running);
      const generated = await runRuntimeJsonTask(buildSummaryPrompt(running, artifact), fallback);
      if (!generated.payload) {
        const failed = await updateSession(sessionId, {
          keyPoints: [],
          summary: null,
          summaryCards: null,
          summaryError: generated.provenance.fallbackReason || 'AI summary generation failed.',
          summaryFallbackReason: generated.provenance.fallbackReason,
          summaryFinishedAt: nowIso(),
          summaryGeneratedBy: '',
          summaryRuntimeUsed: false,
          summaryStatus: 'error',
        });
        return { session: failed };
      }

      const raw = generated.payload || {};
      const summaryCards = {
        ...fallback(),
        ...raw,
        keyPoints: Array.isArray(raw?.keyPoints) ? raw.keyPoints.map((entry) => clipText(entry, 180)).filter(Boolean) : fallback().keyPoints,
        sectionSummaries: Array.isArray(raw?.sectionSummaries)
          ? raw.sectionSummaries.map((entry, index) => ({
              id: ensureTrimmedString(entry.id, `section-summary-${index + 1}`),
              label: ensureTrimmedString(entry.label, artifact.sections?.[index]?.label || `Section ${index + 1}`),
              page: entry.page ?? artifact.sections?.[index]?.pageStart ?? null,
              sectionId: ensureTrimmedString(entry.sectionId, artifact.sections?.[index]?.id || ''),
              summary: clipText(entry.summary, 260),
            }))
          : fallback().sectionSummaries,
      };
      const next = await updateSession(sessionId, {
        keyPoints: summaryCards.keyPoints,
        summary: clipText(summaryCards.tldr, 320),
        summaryCards,
        summaryError: '',
        summaryFallbackReason: generated.provenance.fallbackReason,
        summaryFinishedAt: nowIso(),
        summaryGeneratedBy: generated.provenance.generatedBy,
        summaryRuntimeUsed: generated.provenance.runtimeUsed,
        summaryStatus: 'done',
      });

      return { session: next };
    },

    async extractAssets(sessionId) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Parse paper must complete before assets can be extracted.');
      }

      const artifact = await readParsedArtifact(session);
      if (!artifact) {
        throw new Error('Parsed artifact is missing for this session.');
      }

      const assets = await buildAssetsFromArtifact(sessionId, artifact);
      const next = await updateSession(sessionId, {
        assets,
      });

      return { assets, session: next };
    },

    async getSessionAssetFile(sessionId, { assetId, kind = 'thumb' } = {}) {
      const session = await getSessionOrThrow(sessionId);
      const asset = session.assets.find((entry) => entry.id === assetId);
      if (!asset) {
        throw new Error(`Unknown reading asset: ${assetId}`);
      }

      const relativePath = kind === 'data' ? asset.dataPath : asset.thumbPath || asset.dataPath;
      if (!relativePath) {
        throw new Error(`Asset ${assetId} does not have a ${kind} file.`);
      }

      const ext = path.extname(relativePath).toLowerCase();
      const contentType =
        ext === '.svg'
          ? 'image/svg+xml; charset=utf-8'
          : ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.json'
                ? 'application/json; charset=utf-8'
                : 'application/octet-stream';

      return {
        asset,
        buffer: await fs.readFile(resolveSafePath(rootDir, relativePath)),
        contentType,
      };
    },

    async chat(sessionId, { message, noteId = '', selection: selectionInput = null } = {}) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Parse paper must complete before chat is available.');
      }

      const prompt = ensureTrimmedString(message, '');
      if (!prompt) {
        throw new Error('message is required.');
      }

      const artifact = await readParsedArtifact(session);
      if (!artifact) {
        throw new Error('Parsed artifact is missing for this session.');
      }

      const note = session.notes.find((entry) => entry.id === noteId) || null;
      const selection = normaliseChatSelection(selectionInput);
      const queryTerms = tokenize([prompt, note?.quote, note?.body, selection?.quote].filter(Boolean).join(' '));
      const rankedChunks = (artifact.chunks || [])
        .map((chunk) => ({
          ...chunk,
          score: scoreChunk(queryTerms, chunk, { message: prompt, note }),
        }))
        .sort((left, right) => right.score - left.score || left.page - right.page)
        .filter((chunk) => chunk.score > 0)
        .slice(0, MAX_CHAT_CHUNKS);
      const fallback = () => {
        const base = buildChatFallback({
          chunks: rankedChunks,
          message: prompt,
          summaryCards: session.summaryCards,
        });
        if (!selection?.quote) {
          return base;
        }

        const selectedCitation = {
          label: 'Selected PDF text',
          page: selection.page,
          quote: clipText(selection.quote, 220),
          sectionId: 'selection',
        };
        const asksForTranslation = /번역|translate|translation|한국어|korean/i.test(prompt);
        const selectedAnswer = asksForTranslation
          ? `선택한 PDF 텍스트가 컨텍스트로 전달되었습니다. 현재 런타임 응답을 생성하지 못해 원문을 기준으로 표시합니다: "${clipText(selection.quote, 360)}"`
          : `선택한 PDF 텍스트를 우선 컨텍스트로 사용했습니다. ${base.answer}`;

        return {
          ...base,
          answer: clipText(selectedAnswer, 480),
          citations: [selectedCitation, ...(Array.isArray(base.citations) ? base.citations : [])],
        };
      };
      const generated = await runRuntimeJsonTask(
        buildChatPrompt(session, session.summaryCards, prompt, rankedChunks, note, selection),
        fallback,
      );
      const raw = generated.payload || {};

      const userMessage = {
        createdAt: nowIso(),
        id: `chat-user-${Date.now()}`,
        role: 'user',
        selection,
        text: prompt,
      };
      const assistantMessage = {
        citations: Array.isArray(raw?.citations)
          ? raw.citations
          : fallback().citations,
        createdAt: nowIso(),
        fallbackReason: generated.provenance.fallbackReason,
        generatedBy: generated.provenance.generatedBy,
        id: `chat-assistant-${Date.now()}`,
        role: 'assistant',
        text: clipText(raw?.answer || fallback().answer, 480),
      };
      const chatMessages = [...session.chatMessages, userMessage, assistantMessage];
      const next = await updateSession(sessionId, {
        chatMessages,
      });

      return {
        messages: [userMessage, assistantMessage],
        session: next,
      };
    },

    async createNote(sessionId, payload = {}) {
      const session = await getSessionOrThrow(sessionId);
      const timestamp = nowIso();
      const note = {
        body: ensureTrimmedString(payload.body, ''),
        createdAt: timestamp,
        id: payload.id || `note-${Date.now()}`,
        kind: ensureTrimmedString(payload.kind, 'note'),
        origin: ensureTrimmedString(payload.origin, payload.sourceHighlightId ? 'highlight' : 'user'),
        page: payload.page === undefined || payload.page === null || payload.page === '' ? null : Number(payload.page) || 1,
        quote: clipText(payload.quote, 900),
        sectionId: ensureTrimmedString(payload.sectionId, ''),
        sourceHighlightId: ensureTrimmedString(payload.sourceHighlightId, '') || null,
        updatedAt: timestamp,
      };
      const next = await updateSession(sessionId, {
        notes: [...session.notes, note],
      });
      return {
        note,
        session: next,
      };
    },

    async updateNote(sessionId, noteId, payload = {}) {
      const session = await getSessionOrThrow(sessionId);
      const notes = session.notes.map((note) => {
        if (note.id !== noteId) {
          return note;
        }

        return {
          ...note,
          body: payload.body !== undefined ? ensureTrimmedString(payload.body, '') : note.body,
          kind: payload.kind !== undefined ? ensureTrimmedString(payload.kind, 'note') : note.kind,
          page:
            payload.page !== undefined
              ? payload.page === null || payload.page === ''
                ? null
                : Number(payload.page) || 1
              : note.page,
          quote: payload.quote !== undefined ? clipText(payload.quote, 900) : note.quote,
          sectionId: payload.sectionId !== undefined ? ensureTrimmedString(payload.sectionId, '') : note.sectionId,
          updatedAt: nowIso(),
        };
      });
      const note = notes.find((entry) => entry.id === noteId);
      if (!note) {
        throw new Error(`Unknown note: ${noteId}`);
      }

      const next = await updateSession(sessionId, { notes });
      return {
        note,
        session: next,
      };
    },

    async deleteNote(sessionId, noteId) {
      const session = await getSessionOrThrow(sessionId);
      const notes = session.notes.filter((note) => note.id !== noteId);
      if (notes.length === session.notes.length) {
        throw new Error(`Unknown note: ${noteId}`);
      }

      const next = await updateSession(sessionId, { notes });
      return {
        ok: true,
        session: next,
      };
    },

    async readRelativeFile(relativePath) {
      const filePath = resolveSafePath(rootDir, relativePath);
      return fs.readFile(filePath);
    },
  };
}
