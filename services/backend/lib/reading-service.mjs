import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PDFParse } from 'pdf-parse';

import { createLocalArtifactStore } from './artifact-store.mjs';
import { normaliseReadingPacket } from './asset-model.mjs';
import { createAgentRuntime, DEFAULT_AGENT_TIMEOUT_MS } from './agent-runtime.mjs';
import {
  buildReadingSessionSeed,
  normaliseReadingSession,
  normaliseSourceBounds,
  nowIso,
} from './reading-model.mjs';

const READING_RUNTIME_DIR = path.join('data', 'runtime', 'reading');
const DEMO_PDF_HOST = 'example.org';
const MAX_CHAT_CHUNKS = 4;
export const CHAT_EVIDENCE_POLICY = Object.freeze({
  minEvidenceScore: 4,
});
const MIN_CHAT_EVIDENCE_SCORE = CHAT_EVIDENCE_POLICY.minEvidenceScore;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
const PDF_CROP_SCALE = 1.35;
const PDF_OCR_SCALE = 2;
const DEFAULT_OCR_MAX_PAGES = 12;
const SEMANTIC_QUERY_ALIASES = new Map([
  ['accuracy', ['quality', 'performance', 'score', 'scores']],
  ['cost', ['compute', 'efficient', 'efficiency', 'expensive', 'latency', 'runtime']],
  ['decrease', ['avoid', 'avoiding', 'lower', 'lowers', 'reduce', 'reduces']],
  ['expense', ['compute', 'cost', 'expensive', 'latency', 'runtime']],
  ['improve', ['increase', 'increases', 'quality', 'performance']],
  ['limit', ['failure', 'limitation', 'limitations', 'risk', 'weakness']],
  ['quality', ['accuracy', 'performance', 'score', 'scores']],
  ['reduce', ['avoid', 'avoiding', 'decrease', 'lower', 'lowers', 'efficient', 'efficiency']],
  ['result', ['benchmark', 'evaluation', 'experiment', 'metric', 'metrics']],
]);

let pdfCropRuntimePromise = null;

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

const CHAT_QUERY_STOPWORDS = new Set([
  'and',
  'about',
  'are',
  'concludes',
  'conclude',
  'does',
  'for',
  'from',
  'how',
  'is',
  'main',
  'of',
  'that',
  'the',
  'this',
  'with',
  'paper',
  'what',
]);

function chatQueryFocusTerms(message) {
  return tokenize(message).filter((token) => !CHAT_QUERY_STOPWORDS.has(token));
}

function expandSemanticTerms(tokens) {
  const expanded = new Set();
  for (const token of tokens) {
    if (CHAT_QUERY_STOPWORDS.has(token)) {
      continue;
    }

    expanded.add(token);
    for (const alias of SEMANTIC_QUERY_ALIASES.get(token) || []) {
      expanded.add(alias);
    }
  }

  return expanded;
}

function hasReadingEvidenceForPrompt(message, chunks, selection, retrievalTrace = null) {
  if (selection?.quote) {
    return true;
  }

  if (!chunks.length) {
    return false;
  }

  if (Number(retrievalTrace?.topScore) >= MIN_CHAT_EVIDENCE_SCORE) {
    return true;
  }

  const focusTerms = chatQueryFocusTerms(message);
  if (!focusTerms.length) {
    return true;
  }

  return false;
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

function slugFileName(value, fallback = 'upload.pdf') {
  const base = ensureTrimmedString(value, fallback)
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withName = base || fallback;
  return /\.pdf$/i.test(withName) ? withName : `${withName}.pdf`;
}

function titleFromFileName(value) {
  return slugFileName(value).replace(/\.pdf$/i, '').trim() || 'Uploaded PDF';
}

function decodeUploadedPdf({ contentBase64 = '', contentBuffer = null } = {}) {
  const compact = ensureTrimmedString(contentBase64, '').replace(/^data:application\/pdf;base64,/i, '');
  if (!compact && !contentBuffer) {
    throw new Error('PDF upload content is required.');
  }

  const buffer = contentBuffer ? Buffer.from(contentBuffer) : Buffer.from(compact, 'base64');
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`PDF upload must be between 1 byte and ${MAX_UPLOAD_MB}MB.`);
  }

  if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
    throw new Error('Uploaded file must be a PDF.');
  }

  return buffer;
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

function buildPagesFromImportedText(text, sourceLabel) {
  const normalized = ensureTrimmedString(text, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized || normalized.length < 40) {
    throw new Error('Imported OCR text must include at least 40 characters.');
  }

  const explicitPages = normalized
    .split(/\n?---+\s*page\s+\d+\s*---+\n?|\f/gi)
    .map((pageText) => pageText.trim())
    .filter(Boolean);
  const chunks = explicitPages.length
    ? explicitPages
    : normalized.match(/[\s\S]{1,4000}(?=\s|$)/g)?.map((pageText) => pageText.trim()).filter(Boolean) || [normalized];

  return chunks.map((pageText, index) => ({
    num: index + 1,
    sourceLabel,
    text: pageText,
  }));
}

function buildMetadataText(session) {
  return [
    session.title ? `Title\n${session.title}` : '',
    session.abstract ? `Abstract\n${session.abstract}` : '',
    session.summary ? `Summary\n${session.summary}` : '',
    Array.isArray(session.keyPoints) && session.keyPoints.length ? `Key points\n${session.keyPoints.join('\n')}` : '',
    Array.isArray(session.keywords) && session.keywords.length ? `Keywords\n${session.keywords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
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
      const sectionMatched = Boolean(entry.section && chunk?.sectionId === entry.section.id);

      return {
        confidence: sectionMatched && chunk?.quality >= 12 ? 0.84 : sectionMatched ? 0.68 : 0.52,
        id: `highlight-${index + 1}`,
        page: chunk?.page || entry.section?.pageStart || 1,
        quote: text,
        sectionId: entry.section?.id || '',
        selectionMethod: sectionMatched ? 'section-keyword-chunk' : 'document-best-chunk',
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
    confidence: highlight.confidence || 0.5,
    seedMethod: highlight.selectionMethod || 'parse-seed',
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
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter((entry) => entry.line)
    .map(({ line, lineIndex }) => {
      const match = line.match(regex);
      if (!match) {
        return null;
      }

      return {
        caption: clipText(`${kind === 'table' ? 'Table' : 'Figure'} ${match[1]}. ${match[2]}`, 180),
        lineIndex,
        number: Number(match[1]) || 1,
        sourceText: line,
      };
    })
    .filter(Boolean);
}

function buildAssetSourceRegion(pageText, { lineIndex = 0, lineSpan = 1, page = 1, sourceText = '' } = {}) {
  const lines = ensureTrimmedString(pageText, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const total = Math.max(lines.length, 1);
  const safeLine = Math.min(Math.max(Number(lineIndex) || 0, 0), total - 1);
  const safeSpan = Math.min(Math.max(Number(lineSpan) || 1, 1), total - safeLine);
  const y = Math.max(0, Math.min(0.94, safeLine / total));
  const height = Math.max(0.06, Math.min(0.5, safeSpan / total + 0.04));

  return {
    sourceBounds: {
      height,
      page: Math.max(1, Number(page) || 1),
      unit: 'page-ratio',
      width: 0.84,
      x: 0.08,
      y,
    },
    sourceText: clipText(sourceText || lines.slice(safeLine, safeLine + safeSpan).join(' '), 420),
  };
}

async function loadPdfCropRuntime() {
  if (!pdfCropRuntimePromise) {
    pdfCropRuntimePromise = Promise.all([
      import(new URL('../../../node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.mjs', import.meta.url)),
      import('@napi-rs/canvas'),
    ]).then(([pdfjs, canvasModule]) => ({
      createCanvas: canvasModule.createCanvas,
      pdfjs,
    }));
  }

  return pdfCropRuntimePromise;
}

function clampRatio(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, number));
}

async function renderPdfCropPng(pdfBuffer, sourceBounds) {
  if (!pdfBuffer?.length || !sourceBounds || sourceBounds.unit !== 'page-ratio') {
    return null;
  }

  const { createCanvas, pdfjs } = await loadPdfCropRuntime();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
  });
  const document = await loadingTask.promise;

  try {
    const pageNumber = Math.min(Math.max(1, Number(sourceBounds.page) || 1), document.numPages);
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_CROP_SCALE });
    const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const pageContext = pageCanvas.getContext('2d');
    await page.render({ canvasContext: pageContext, viewport }).promise;

    const x = clampRatio(sourceBounds.x);
    const y = clampRatio(sourceBounds.y);
    const width = Math.max(0.04, clampRatio(sourceBounds.width, 0.84));
    const height = Math.max(0.04, clampRatio(sourceBounds.height, 0.12));
    const sx = Math.floor(x * pageCanvas.width);
    const sy = Math.floor(y * pageCanvas.height);
    const sw = Math.max(24, Math.min(pageCanvas.width - sx, Math.ceil(width * pageCanvas.width)));
    const sh = Math.max(24, Math.min(pageCanvas.height - sy, Math.ceil(height * pageCanvas.height)));
    const cropCanvas = createCanvas(sw, sh);
    const cropContext = cropCanvas.getContext('2d');
    cropContext.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const encoded = cropCanvas.encode('png');
    return encoded instanceof Promise ? encoded : await encoded;
  } finally {
    await document.destroy();
  }
}

async function renderPdfPagesPng(pdfBuffer, { maxPages = DEFAULT_OCR_MAX_PAGES } = {}) {
  if (!pdfBuffer?.length) {
    return [];
  }

  const { createCanvas, pdfjs } = await loadPdfCropRuntime();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
  });
  const document = await loadingTask.promise;

  try {
    const limit = Math.min(document.numPages, Math.max(1, Number(maxPages) || DEFAULT_OCR_MAX_PAGES));
    const pages = [];
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
      const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const pageContext = pageCanvas.getContext('2d');
      await page.render({ canvasContext: pageContext, viewport }).promise;
      const encoded = pageCanvas.encode('png');
      pages.push({
        buffer: encoded instanceof Promise ? await encoded : encoded,
        num: pageNumber,
      });
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

export function createTesseractOcrEngine({ language = 'eng' } = {}) {
  const safeLanguage = ensureTrimmedString(language, 'eng');
  return {
    provider: 'tesseract.js',
    async recognizePdf({ maxPages = DEFAULT_OCR_MAX_PAGES, pdfBuffer } = {}) {
      const { createWorker } = await import('tesseract.js');
      const renderedPages = await renderPdfPagesPng(pdfBuffer, { maxPages });
      const worker = await createWorker(safeLanguage);

      try {
        const pages = [];
        for (const page of renderedPages) {
          const result = await worker.recognize(page.buffer);
          pages.push({
            num: page.num,
            text: ensureTrimmedString(result?.data?.text, ''),
          });
        }

        return {
          generatedAt: nowIso(),
          pages,
          tool: `tesseract.js:${safeLanguage}`,
        };
      } finally {
        await worker.terminate();
      }
    },
  };
}

function normaliseOcrPages(pages = [], sourceLabel = 'Built-in OCR') {
  return (Array.isArray(pages) ? pages : [])
    .map((page, index) => ({
      num: Math.max(1, Number(page?.num || page?.page || index + 1) || index + 1),
      sourceLabel,
      text: ensureTrimmedString(page?.text, ''),
    }))
    .filter((page) => page.text);
}

function buildAssetQuality(asset = {}) {
  const checks = [];
  if (asset.sourceBounds?.unit === 'page-ratio') {
    checks.push('source-bounds');
  }
  if (ensureTrimmedString(asset.sourceText, '')) {
    checks.push('source-text');
  }
  if (asset.kind === 'table' && Array.isArray(asset.rows) && asset.rows.length) {
    checks.push('table-rows');
  }
  if (asset.dataPath) {
    checks.push('data-file');
  }
  if (asset.thumbPath) {
    checks.push(asset.thumbPath.endsWith('.png') ? 'rendered-thumbnail' : 'synthetic-thumbnail');
  }

  const sourceBacked = checks.includes('source-bounds') && checks.includes('source-text');
  const score = Math.min(
    1,
    0.2 +
      (checks.includes('source-bounds') ? 0.32 : 0) +
      (checks.includes('source-text') ? 0.18 : 0) +
      (checks.includes('table-rows') || checks.includes('rendered-thumbnail') ? 0.18 : 0) +
      (checks.includes('data-file') ? 0.08 : 0) +
      (checks.includes('synthetic-thumbnail') ? 0.04 : 0),
  );

  return {
    checks,
    score: Number(score.toFixed(2)),
    status: sourceBacked ? 'source-backed' : checks.length ? 'partial' : 'synthetic',
  };
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
    .map((line) => {
      if (line.includes('|')) {
        return line.split('|').map((cell) => cell.trim()).filter(Boolean);
      }

      if (line.includes('\t')) {
        return line.split('\t').map((cell) => cell.trim()).filter(Boolean);
      }

      if (/\s{2,}/.test(line)) {
        return line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
      }

      return [];
    })
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

function scoreChunkFeatures(queryTerms, chunk, { message = '', note = null } = {}) {
  if (!queryTerms.length) {
    return {
      lexicalScore: 0,
      noteBoost: 0,
      phraseBoost: 0,
      score: 0,
      titleBoost: 0,
    };
  }

  const bag = new Map();
  for (const token of chunk.terms || []) {
    bag.set(token, (bag.get(token) || 0) + 1);
  }

  const focusTerms = queryTerms.filter((token) => !CHAT_QUERY_STOPWORDS.has(token));
  const lexical = focusTerms.reduce((score, token) => score + (bag.get(token) || 0), 0);
  const text = ensureTrimmedString(chunk.text, '').toLowerCase();
  const phrase = ensureTrimmedString(message, '').toLowerCase();
  const phraseBoost = phrase.length >= 12 && text.includes(phrase.slice(0, 80)) ? 8 : 0;
  const noteSectionBoost = note?.sectionId && note.sectionId === chunk.sectionId ? 6 : 0;
  const notePageBoost = note?.page && Number(note.page) === Number(chunk.page) ? 4 : 0;
  const titleBoost =
    lexical + phraseBoost + noteSectionBoost + notePageBoost > 0 &&
    /method|result|limit|claim|contribution|experiment|evaluation/i.test(chunk.sectionLabel || '')
      ? 3
      : 0;
  const noteBoost = noteSectionBoost + notePageBoost;
  return {
    lexicalScore: lexical,
    noteBoost,
    phraseBoost,
    score: lexical + phraseBoost + noteBoost + titleBoost,
    titleBoost,
  };
}

function scoreChunk(queryTerms, chunk, { message = '', note = null } = {}) {
  return scoreChunkFeatures(queryTerms, chunk, { message, note }).score;
}

function normaliseSemanticScores(result) {
  const scores = new Map();
  if (!Array.isArray(result)) {
    return scores;
  }

  for (const entry of result) {
    const chunkId = ensureTrimmedString(entry?.chunkId || entry?.id, '');
    const score = Number(entry?.score) || 0;
    if (!chunkId || score <= 0) {
      continue;
    }

    scores.set(chunkId, score);
  }

  return scores;
}

function createHeuristicRetrievalScorer() {
  return {
    async scoreChunks({ chunks, queryTerms }) {
      const expandedTerms = expandSemanticTerms(queryTerms || []);
      if (!expandedTerms.size) {
        return [];
      }

      return chunks
        .map((chunk) => {
          const terms = new Set(chunk.terms || tokenize(chunk.text));
          let score = 0;
          for (const term of expandedTerms) {
            if (terms.has(term)) {
              score += 2;
            }
          }

          return {
            chunkId: chunk.id,
            score,
          };
        })
        .filter((entry) => entry.score > 0);
    },
  };
}

function retrievalConfidence(topScore) {
  if (topScore >= 12) {
    return 'high';
  }

  if (topScore >= 6) {
    return 'medium';
  }

  if (topScore >= MIN_CHAT_EVIDENCE_SCORE) {
    return 'low';
  }

  return 'none';
}

function buildRetrievalTrace({ rankedChunks, queryTerms, scorer }) {
  const topScore = Number(rankedChunks[0]?.score) || 0;
  const confidence = retrievalConfidence(topScore);
  return {
    chunks: rankedChunks.map((chunk) => ({
      chunkId: chunk.id,
      lexicalScore: Number(chunk.lexicalScore) || 0,
      page: chunk.page || null,
      phraseBoost: Number(chunk.phraseBoost) || 0,
      score: Number(chunk.score) || 0,
      sectionId: chunk.sectionId || '',
      semanticScore: Number(chunk.semanticScore) || 0,
      titleBoost: Number(chunk.titleBoost) || 0,
    })),
    confidence,
    lowConfidence: confidence === 'low' || confidence === 'none',
    minEvidenceScore: MIN_CHAT_EVIDENCE_SCORE,
    mode: 'hybrid',
    queryTerms: Array.from(new Set(queryTerms.filter((term) => !CHAT_QUERY_STOPWORDS.has(term)))).slice(0, 10),
    scorer,
    topK: rankedChunks.length,
    topScore,
  };
}

export function createReadingService({
  agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
  agentRuntime = null,
  artifactStore = null,
  enableDemoPdf = false,
  fetchImpl = globalThis.fetch,
  ocrEngine = createTesseractOcrEngine(),
  ocrMaxPages = DEFAULT_OCR_MAX_PAGES,
  pdfParseFactory = (options) => new PDFParse(options),
  requireAgentRuntime = false,
  retrievalScorer = null,
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
  const artifacts = artifactStore || createLocalArtifactStore({ rootDir });
  const activeRetrievalScorer = retrievalScorer || createHeuristicRetrievalScorer();
  const retrievalScorerLabel = retrievalScorer
    ? ensureTrimmedString(retrievalScorer.provider || retrievalScorer.name, 'custom')
    : 'heuristic-semantic-alias';

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

  function buildReadingPacketFromSession(session) {
    const normalized = normaliseReadingSession(session);
    const limit = ensureTrimmedString(normalized.summaryCards?.limit, '');
    const noteEvidenceLinkIds = normalized.notes.map((note) => note.evidenceLinkId).filter(Boolean);
    return normaliseReadingPacket({
      agentRunIds: [normalized.runId].filter(Boolean),
      evidenceLinkIds: [...new Set([...(normalized.evidenceLinkIds || []), ...noteEvidenceLinkIds])],
      id: `packet-${normalized.id}`,
      keyPoints: normalized.keyPoints?.length ? normalized.keyPoints : normalized.summaryCards?.keyPoints || [],
      limitations: limit ? [limit] : [],
      methodParameters: normalized.reproParams,
      notes: normalized.notes,
      paperId: normalized.paperId,
      projectId: normalized.projectId,
      questionId: normalized.questionId || '',
      sections: normalized.sections,
      status: normalized.parseStatus === 'done' ? 'done' : normalized.parseStatus === 'error' ? 'error' : normalized.status,
      summary: normalized.summary || normalized.summaryCards?.tldr || '',
      updatedAt: normalized.updatedAt,
    });
  }

  async function syncReadingPacket(session) {
    if (typeof store.upsertProjectAsset !== 'function') {
      return normaliseReadingSession(session);
    }

    const normalized = normaliseReadingSession(session);
    await store.upsertProjectAsset('readingPackets', buildReadingPacketFromSession(normalized), {
      matchBy: 'id',
      prefix: 'packet',
    });
    return normalized;
  }

  async function readParsedArtifact(session) {
    const relativePath = ensureTrimmedString(session.parsedArtifactPath, '');
    if (!relativePath) {
      return null;
    }

    return artifacts.readJson(relativePath);
  }

  async function writeParsedArtifact(sessionId, artifact) {
    const relativePath = buildSessionRelativePath(sessionId, 'parsed-artifact.json');
    return artifacts.writeJson(relativePath, artifact);
  }

  async function writeJsonAsset(sessionId, name, payload) {
    const relativePath = buildSessionRelativePath(sessionId, name);
    return artifacts.writeJson(relativePath, payload);
  }

  async function writeTextAsset(sessionId, name, payload) {
    const relativePath = buildSessionRelativePath(sessionId, name);
    return artifacts.writeText(relativePath, payload);
  }

  async function writeBinaryAsset(sessionId, name, payload) {
    const relativePath = buildSessionRelativePath(sessionId, name);
    return artifacts.writeBinary(relativePath, payload);
  }

  function buildDemoPdfForSession(session) {
    return createDemoPdfBuffer(session);
  }

  async function fetchPdfBuffer(session) {
    const pdfUrl = ensureTrimmedString(session.pdfUrl, '');
    if (!pdfUrl) {
      throw new Error('PDF URL is not available for this reading session.');
    }

    const parsedPdfUrl = (() => {
      try {
        return new URL(pdfUrl);
      } catch {
        return null;
      }
    })();

    if (parsedPdfUrl?.hostname === DEMO_PDF_HOST) {
      if (!enableDemoPdf) {
        throw new Error('Demo PDF generation is disabled. Set ARES_ENABLE_DEMO_PDF=true to use example.org fixtures.');
      }
      return buildDemoPdfForSession(session);
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
      if (await artifacts.exists(cachedRelativePath)) {
        return {
          buffer: await artifacts.readFile(cachedRelativePath),
          cachePath: cachedRelativePath,
        };
      }
    }

    const buffer = await fetchPdfBuffer(session);
    const relativePath = buildSessionRelativePath(session.id, 'source.pdf');
    await artifacts.writeBinary(relativePath, buffer);

    const nextSession = await store.upsertReadingSession(
      normaliseReadingSession(
        {
          ...session,
          pdfCachePath: relativePath,
        },
        { existing: session },
      ),
    );
    await syncReadingPacket(nextSession);

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
    return syncReadingPacket(await store.upsertReadingSession(next));
  }

  async function buildAssetsFromArtifact(sessionId, artifact, { pdfBuffer = null } = {}) {
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
      const pageText = (artifact.pages || []).find((page) => page.num === figure.page)?.text || figure.sourceText || '';
      const sourceRegion = buildAssetSourceRegion(pageText, {
        lineIndex: figure.lineIndex,
        page: figure.page,
        sourceText: figure.sourceText || figure.caption,
      });
      const cropBuffer = await renderPdfCropPng(pdfBuffer, sourceRegion.sourceBounds).catch(() => null);
      const thumbPath = cropBuffer
        ? await writeBinaryAsset(sessionId, `figure-${figure.number}.png`, cropBuffer)
        : await writeTextAsset(sessionId, `figure-${figure.number}.svg`, buildFigureSvg(figure.caption));
      assets.push({
        caption: figure.caption,
        id: `figure-${figure.number}`,
        kind: 'figure',
        number: figure.number,
        page: figure.page,
        ...sourceRegion,
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
            ...buildAssetSourceRegion('', {
              page: page.num || page.pageNumber || 1,
              sourceText: image.name || `Figure ${assets.length + 1}`,
            }),
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
          const tableMeta = tableCandidates.find((entry) => entry.page === page.num);
          const caption = tableMeta?.caption || `Table ${index + 1}`;
          const number = tableMeta?.number || index + 1;
          const dataPath = await writeJsonAsset(sessionId, `table-${page.num}-${index + 1}.json`, rows);
          const pageText = (artifact.pages || []).find((entry) => entry.num === page.num)?.text || '';
          const sourceRegion = buildAssetSourceRegion(pageText, {
            lineIndex: tableMeta?.lineIndex,
            lineSpan: Math.max(1, rows.length + 1),
            page: page.num,
            sourceText: [caption, ...rows.map((row) => row.join(' '))].join(' '),
          });
          assets.push({
            caption,
            dataPath,
            id: `table-${page.num}-${index + 1}`,
            kind: 'table',
            number,
            page: page.num,
            rows,
            ...sourceRegion,
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
        const sourceRegion = buildAssetSourceRegion(page.text, {
          lineIndex: meta.lineIndex,
          lineSpan: Math.max(1, rows.length + 1),
          page: page.num,
          sourceText: [meta.caption, ...rows.map((row) => row.join(' '))].join(' '),
        });
        assets.push({
          caption: meta.caption,
          dataPath,
          id: `table-${page.num}`,
          kind: 'table',
          number: meta.number,
          page: page.num,
          rows,
          ...sourceRegion,
        });
      }
    }

    return assets.map((asset) => ({
      ...asset,
      quality: buildAssetQuality(asset),
    }));
  }

  async function materializeParsedSession(
    session,
    {
      artifactPatch = {},
      imagePages = [],
      pageCount = null,
      pages = [],
      parseFinishedAt: suppliedParseFinishedAt = null,
      pdfBuffer = null,
      sessionPatch = {},
      sourceName = '',
      sourceProvider = '',
      summarySession = null,
      tablePages = [],
    } = {},
  ) {
    const sections = buildSectionsFromPages(pages, session);
    const chunks = buildChunksFromPages(pages, sections);
    const highlights = buildHighlights(sections, chunks, session);
    const notes = buildSeedNotes(highlights, session.notes);
    const reproParams = buildReproParams(session, sections);
    const artifact = {
      chunks,
      createdAt: nowIso(),
      imagePages,
      pageCount: pageCount || pages.length,
      pages,
      sections,
      tablePages,
      ...artifactPatch,
    };
    const parsedArtifactPath = await writeParsedArtifact(session.id, artifact);
    const assets = await buildAssetsFromArtifact(session.id, artifact, { pdfBuffer });
    const evidenceCoverage = buildEvidenceCoverageReport({ artifact, assets });
    const summaryCards = summariseFromSections(sections, summarySession || session);
    const parseFinishedAt = suppliedParseFinishedAt || nowIso();
    const extraSessionPatch =
      typeof sessionPatch === 'function'
        ? sessionPatch({ artifact, chunks, parseFinishedAt, sections, summaryCards })
        : sessionPatch;

    const nextPatch = {
      assets,
      evidenceCoverage,
      highlights,
      notes,
      pageCount: artifact.pageCount,
      parsedArtifactPath,
      parseError: '',
      parseFinishedAt,
      parseStatus: 'done',
      reproParams,
      sections,
      summaryCards,
      ...extraSessionPatch,
    };

    if (sourceName) {
      nextPatch.sourceName = sourceName;
    }
    if (sourceProvider) {
      nextPatch.sourceProvider = sourceProvider;
    }

    const nextSession = await updateSession(session.id, nextPatch);

    return {
      artifact,
      session: nextSession,
    };
  }

  function buildEvidenceCoverageReport({ artifact = {}, assets = [], chatMessages = [], previous = null } = {}) {
    const chunks = Array.isArray(artifact.chunks) ? artifact.chunks : [];
    const sections = Array.isArray(artifact.sections) ? artifact.sections : [];
    const figures = assets.filter((asset) => asset.kind === 'figure');
    const tables = assets.filter((asset) => asset.kind === 'table');
    const assistantMessages = chatMessages.filter((message) => message.role === 'assistant');
    const retrievalMessages = assistantMessages.filter((message) => message.retrieval);
    const lowConfidenceChatCount = retrievalMessages.filter((message) => message.retrieval?.lowConfidence).length;
    const citedChatCount = assistantMessages.filter((message) => Array.isArray(message.citations) && message.citations.length).length;
    const lastRetrieval = retrievalMessages.at(-1)?.retrieval || previous?.lastRetrieval || null;
    const ocrProvenance = artifact.importProvenance || previous?.ocrProvenance || null;

    return {
      assetCount: assets.length,
      chunkCount: chunks.length,
      citedChatCount,
      figureCount: figures.length,
      generatedAt: nowIso(),
      lastRetrievalConfidence: lastRetrieval?.confidence || previous?.lastRetrievalConfidence || '',
      lastRetrievalTopScore: Number(lastRetrieval?.topScore || previous?.lastRetrievalTopScore || 0),
      lowConfidenceChatCount,
      ocrDurationMs: Number.isFinite(Number(ocrProvenance?.durationMs)) ? Number(ocrProvenance.durationMs) : null,
      ocrPageCount: Number(ocrProvenance?.pageCount) || 0,
      ocrProvenance,
      ocrTool: ocrProvenance?.tool || '',
      retrievalReady: chunks.length > 0,
      sectionCount: sections.length,
      sourceBoundedAssetCount: assets.filter((asset) => asset.sourceBounds?.unit === 'page-ratio').length,
      tableCount: tables.length,
    };
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
    return { lineCount, page, quote, sourceBounds: normaliseSourceBounds(value.sourceBounds, page || 1) };
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
      await syncReadingPacket(session);
      await store.queuePaper(projectId, paper, {
        runId: session.runId,
        sessionId: session.id,
        status: session.status,
      });
      return normaliseReadingSession(session);
    },

    async createUploadedSession({ contentBase64, contentBuffer, fileName = 'upload.pdf', projectId, title = '' } = {}) {
      if (!projectId) {
        throw new Error('projectId is required.');
      }

      const buffer = decodeUploadedPdf({ contentBase64, contentBuffer });
      const safeFileName = slugFileName(fileName);
      const paperId = `upload-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const paperTitle = ensureTrimmedString(title, titleFromFileName(safeFileName));
      const timestamp = nowIso();
      const paper = {
        abstract: '',
        authors: [],
        citedByCount: 0,
        keyPoints: [],
        keywords: [],
        matchedKeywords: [],
        openAccess: true,
        paperId,
        paperUrl: null,
        pdfUrl: `uploaded://${paperId}/${encodeURIComponent(safeFileName)}`,
        relevance: 0,
        sourceName: safeFileName,
        sourceProvider: 'upload',
        summary: '',
        title: paperTitle,
        venue: 'Uploaded PDF',
        year: null,
      };

      const savedPaper = await store.savePaper(projectId, paper);
      const seed = buildReadingSessionSeed(projectId, savedPaper, {
        createdAt: timestamp,
        sourceRefs: [{ id: paperId, type: 'upload', label: safeFileName }],
        status: 'todo',
      });
      const session = normaliseReadingSession(seed);
      const pdfCachePath = await writeBinaryAsset(session.id, 'source.pdf', buffer);
      const nextSession = await store.upsertReadingSession(
        normaliseReadingSession(
          {
            ...session,
            pdfCachePath,
          },
          { existing: session },
        ),
      );
      await syncReadingPacket(nextSession);

      await store.queuePaper(projectId, savedPaper, {
        sessionId: nextSession.id,
        status: nextSession.status,
      });

      return {
        paper: savedPaper,
        session: normaliseReadingSession(nextSession),
      };
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
          const metadataText = buildMetadataText(initial);
          if (metadataText) {
            const sourceLabel = 'Paper metadata';
            const pages = buildPagesFromImportedText(metadataText, sourceLabel);
            return materializeParsedSession(initial, {
              artifactPatch: {
                importSource: 'metadata',
              },
              imagePages: [],
              pageCount: pages.length,
              pages,
              sourceName: sourceLabel,
              sourceProvider: 'metadata',
              tablePages: [],
            });
          }

          const failed = await updateSession(sessionId, {
            parseError: 'PDF URL and usable paper metadata are not available for this paper.',
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
          const pageCount = Number(infoResult.total || textResult.total) || null;
          if (ocrEngine?.recognizePdf) {
            const ocrStartedAtMs = Date.now();
            const ocrResult = await ocrEngine.recognizePdf({
              maxPages: ocrMaxPages,
              pageCount,
              pdfBuffer: cached.buffer,
              session: initial,
            });
            const ocrDurationMs = Math.max(0, Date.now() - ocrStartedAtMs);
            const sourceLabel = 'Built-in OCR';
            const ocrPages = normaliseOcrPages(ocrResult?.pages, sourceLabel);
            if (ocrPages.length) {
              const ocrPageCount = ocrPages.length;
              return materializeParsedSession(initial, {
                artifactPatch: {
                  importProvenance: {
                    durationMs: ocrDurationMs,
                    generatedAt: ocrResult?.generatedAt || null,
                    maxPages: ocrMaxPages,
                    pageCount: ocrPageCount,
                    sourceLabel,
                    textLength: ocrPages.reduce((sum, page) => sum + page.text.length, 0),
                    tool: ocrResult?.tool || ocrEngine.provider || 'built-in-ocr',
                  },
                  importSource: 'built-in-ocr',
                },
                imagePages: imageResult.pages || [],
                pageCount: pageCount || ocrPages.length,
                pages: ocrPages,
                pdfBuffer: cached.buffer,
                sessionPatch: ({ artifact, parseFinishedAt }) => ({
                  ocrProvenance: {
                    durationMs: artifact.importProvenance.durationMs,
                    generatedAt: ocrResult?.generatedAt || null,
                    importedAt: parseFinishedAt,
                    maxPages: artifact.importProvenance.maxPages,
                    pageCount: artifact.importProvenance.pageCount,
                    sourceLabel,
                    textLength: artifact.importProvenance.textLength,
                    tool: artifact.importProvenance.tool,
                  },
                  summaryGeneratedBy: 'built-in-ocr',
                  summaryRuntimeUsed: true,
                  summaryStatus: 'done',
                }),
                sourceName: sourceLabel,
                sourceProvider: 'built-in-ocr',
                tablePages: [],
              });
            }
          }

          const failed = await updateSession(sessionId, {
            parseError:
              'This PDF does not expose a usable text layer, and built-in OCR did not produce usable text. Import OCR text to recover this session.',
            parseFinishedAt: nowIso(),
            parseStatus: 'error',
            pageCount,
          });
          return { session: failed };
        }

        return materializeParsedSession(initial, {
          imagePages: imageResult.pages || [],
          pageCount: Number(infoResult.total || textResult.total) || pages.length,
          pages,
          pdfBuffer: cached.buffer,
          tablePages: tableResult.pages || [],
        });
      } catch (error) {
        const failed = await updateSession(sessionId, {
          parseError: error instanceof Error ? error.message : String(error),
          parseFinishedAt: nowIso(),
          parseStatus: 'error',
        });
        return { session: failed };
      }
    },

    async importTextSession(sessionId, { generatedAt = null, sourceLabel = 'External OCR text', text = '', tool = '' } = {}) {
      const initial = await updateSession(sessionId, {
        parseError: '',
        parseFinishedAt: null,
        parseStartedAt: nowIso(),
        parseStatus: 'running',
        status: 'running',
      });

      const label = clipText(ensureTrimmedString(sourceLabel, 'External OCR text'), 120);
      const importedAt = nowIso();
      const pages = buildPagesFromImportedText(text, label);
      const ocrProvenance = {
        durationMs: null,
        generatedAt,
        importedAt,
        maxPages: null,
        pageCount: pages.length,
        sourceLabel: label,
        textLength: ensureTrimmedString(text, '').length,
        tool: clipText(ensureTrimmedString(tool, ''), 120),
      };
      return materializeParsedSession(initial, {
        artifactPatch: {
          importProvenance: ocrProvenance,
          importSource: 'external-ocr',
        },
        imagePages: [],
        pageCount: pages.length,
        pages,
        parseFinishedAt: importedAt,
        sessionPatch: ({ summaryCards }) => ({
          keyPoints: summaryCards.keyPoints,
          ocrProvenance,
          summary: clipText(summaryCards.tldr, 320),
          summaryError: '',
          summaryFinishedAt: importedAt,
          summaryGeneratedBy: 'external-ocr',
          summaryRuntimeUsed: true,
          summaryStatus: 'done',
        }),
        sourceName: label,
        sourceProvider: 'external-ocr',
        summarySession: {
          ...initial,
          abstract: '',
          summary: '',
        },
        tablePages: [],
      });
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
      const generated = await runRuntimeJsonTask(buildSummaryPrompt(running, artifact), fallback, {
        fallbackOnFailure: !requireAgentRuntime,
      });
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

      const pdfBuffer = session.pdfCachePath
        ? await artifacts.readFile(session.pdfCachePath).catch(() => null)
        : null;
      const assets = await buildAssetsFromArtifact(sessionId, artifact, { pdfBuffer });
      const evidenceCoverage = buildEvidenceCoverageReport({
        artifact,
        assets,
        chatMessages: session.chatMessages,
        previous: session.evidenceCoverage,
      });
      const next = await updateSession(sessionId, {
        assets,
        evidenceCoverage,
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
        buffer: await artifacts.readFile(relativePath),
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
      let semanticScores = new Map();
      if (activeRetrievalScorer) {
        try {
          semanticScores = normaliseSemanticScores(
            await activeRetrievalScorer.scoreChunks({
              chunks: artifact.chunks || [],
              message: prompt,
              note,
              queryTerms,
              selection,
              session,
            }),
          );
        } catch {
          semanticScores = new Map();
        }
      }
      const rankedChunks = (artifact.chunks || [])
        .map((chunk) => {
          const lexicalFeatures = scoreChunkFeatures(queryTerms, chunk, { message: prompt, note });
          const semanticScore = semanticScores.get(chunk.id) || 0;
          return {
            ...chunk,
            lexicalScore: lexicalFeatures.lexicalScore,
            noteBoost: lexicalFeatures.noteBoost,
            phraseBoost: lexicalFeatures.phraseBoost,
            score: lexicalFeatures.score + semanticScore,
            semanticScore,
            titleBoost: lexicalFeatures.titleBoost,
          };
        })
        .sort((left, right) => right.score - left.score || left.page - right.page)
        .filter((chunk) => chunk.score > 0)
        .slice(0, MAX_CHAT_CHUNKS);
      const retrievalTrace = buildRetrievalTrace({
        queryTerms,
        rankedChunks,
        scorer: retrievalScorerLabel,
      });
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
      const hasEvidence = hasReadingEvidenceForPrompt(prompt, rankedChunks, selection, retrievalTrace);
      const fallbackPayload = fallback();
      const shouldForceUnsupportedFallback = !hasEvidence;
      const unsupportedFallbackPayload = shouldForceUnsupportedFallback
        ? buildChatFallback({ chunks: [], message: prompt, summaryCards: session.summaryCards })
        : fallbackPayload;
      const generated = shouldForceUnsupportedFallback
        ? null
        : await runRuntimeJsonTask(
            buildChatPrompt(session, session.summaryCards, prompt, rankedChunks, note, selection),
            fallback,
            { fallbackOnFailure: !requireAgentRuntime },
          );
      if (!shouldForceUnsupportedFallback && !generated?.payload) {
        throw new Error(`AI chat generation failed: ${generated?.provenance?.fallbackReason || 'agent runtime unavailable'}`);
      }
      const raw = shouldForceUnsupportedFallback ? unsupportedFallbackPayload : generated.payload || {};
      const provenance = shouldForceUnsupportedFallback
        ? {
            fallbackReason: 'no matching reading evidence',
            generatedBy: 'fallback',
            runtimeUsed: false,
          }
        : generated.provenance;

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
          : fallbackPayload.citations,
        createdAt: nowIso(),
        fallbackReason: provenance.fallbackReason,
        generatedBy: provenance.generatedBy,
        id: `chat-assistant-${Date.now()}`,
        retrieval: retrievalTrace,
        role: 'assistant',
        text: clipText(raw?.answer || fallbackPayload.answer, 480),
      };
      const chatMessages = [...session.chatMessages, userMessage, assistantMessage];
      const evidenceCoverage = buildEvidenceCoverageReport({
        artifact,
        assets: session.assets,
        chatMessages,
        previous: session.evidenceCoverage,
      });
      const next = await updateSession(sessionId, {
        chatMessages,
        evidenceCoverage,
      });

      return {
        messages: [userMessage, assistantMessage],
        session: next,
      };
    },

    async createNote(sessionId, payload = {}) {
      const session = await getSessionOrThrow(sessionId);
      const timestamp = nowIso();
      const noteId = payload.id || `note-${Date.now()}`;
      const evidenceLinkId = `evidence-${session.id}-${noteId}`;
      const note = {
        body: ensureTrimmedString(payload.body, ''),
        createdAt: timestamp,
        evidenceLinkId,
        id: noteId,
        kind: ensureTrimmedString(payload.kind, 'note'),
        origin: ensureTrimmedString(payload.origin, payload.sourceHighlightId ? 'highlight' : 'user'),
        page: payload.page === undefined || payload.page === null || payload.page === '' ? null : Number(payload.page) || 1,
        quote: clipText(payload.quote, 900),
        sectionId: ensureTrimmedString(payload.sectionId, ''),
        sourceBounds: normaliseSourceBounds(payload.sourceBounds, payload.page || 1),
        sourceHighlightId: ensureTrimmedString(payload.sourceHighlightId, '') || null,
        updatedAt: timestamp,
      };
      await store.upsertProjectAsset('evidenceLinks', {
        createdAt: timestamp,
        createdBy: 'user',
        id: evidenceLinkId,
        locator: note.sourceBounds ? { sourceBounds: note.sourceBounds } : {},
        page: note.page,
        paperId: session.paperId,
        projectId: session.projectId,
        quote: note.quote || note.body,
        sectionId: note.sectionId,
        sourceId: note.id,
        sourceType: 'note',
        updatedAt: timestamp,
      });
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
          sourceBounds: payload.sourceBounds !== undefined ? normaliseSourceBounds(payload.sourceBounds, payload.page || note.page || 1) : note.sourceBounds,
          updatedAt: nowIso(),
        };
      });
      const note = notes.find((entry) => entry.id === noteId);
      if (!note) {
        throw new Error(`Unknown note: ${noteId}`);
      }

      if (note.evidenceLinkId) {
        await store.upsertProjectAsset('evidenceLinks', {
          createdAt: note.createdAt,
          createdBy: 'user',
          id: note.evidenceLinkId,
          locator: note.sourceBounds ? { sourceBounds: note.sourceBounds } : {},
          page: note.page,
          paperId: session.paperId,
          projectId: session.projectId,
          quote: note.quote || note.body,
          sectionId: note.sectionId,
          sourceId: note.id,
          sourceType: 'note',
          updatedAt: note.updatedAt,
        });
      }

      const next = await updateSession(sessionId, { notes });
      return {
        note,
        session: next,
      };
    },

    async deleteNote(sessionId, noteId) {
      const session = await getSessionOrThrow(sessionId);
      const note = session.notes.find((entry) => entry.id === noteId);
      const notes = session.notes.filter((note) => note.id !== noteId);
      if (notes.length === session.notes.length) {
        throw new Error(`Unknown note: ${noteId}`);
      }

      const next = await updateSession(sessionId, { notes });
      if (note?.evidenceLinkId && typeof store.deleteProjectAsset === 'function') {
        await store.deleteProjectAsset('evidenceLinks', note.evidenceLinkId, {
          projectId: session.projectId,
        });
      }
      return {
        ok: true,
        session: next,
      };
    },

    async readRelativeFile(relativePath) {
      return artifacts.readFile(relativePath);
    },
  };
}
