import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PDFParse } from 'pdf-parse';

import { createLocalArtifactStore } from './artifact-store.mjs';
import { normaliseReadingPacket } from './asset-model.mjs';
import { createAgentRuntime, DEFAULT_AGENT_TIMEOUT_MS } from './agent-runtime.mjs';
import { createDemoPdfBuffer } from './reading-demo-pdf.mjs';
import {
  buildReadingSessionSeed,
  normaliseReadingSession,
  normaliseSourceBounds,
  nowIso,
} from './reading-model.mjs';

const READING_RUNTIME_DIR = path.join('data', 'runtime', 'reading');
const DEMO_PDF_HOST = 'example.org';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
const PDF_CROP_SCALE = 1.35;
const PDF_OCR_SCALE = 2;
const DEFAULT_OCR_MAX_PAGES = 12;

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

function cleanMetadataText(value = '') {
  return ensureTrimmedString(value, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMetadataAuthorList(value = '') {
  const line = ensureTrimmedString(value, '')
    .replace(/\s+(?:and|&)\s+/gi, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) {
    return [];
  }

  return line
    .split(/\s*,\s*|\s*;\s*/)
    .map(cleanMetadataText)
    .filter(Boolean)
    .slice(0, 8);
}

function cleanProvisionalPdfLine(value = '') {
  return ensureTrimmedString(value, '')
    .replace(/\s+/g, ' ')
    .replace(/^[*\d\s,.;:†‡§|_-]+/, '')
    .replace(/[\d\s,.;:†‡§|_-]+$/, '')
    .trim();
}

function parseProvisionalAuthorLine(value = '') {
  const line = ensureTrimmedString(value, '')
    .replace(/\s+(?:and|&)\s+/gi, ', ')
    .replace(/[†‡§*]/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line || /abstract|keywords?|introduction/i.test(line)) {
    return [];
  }

  return line
    .split(/\s*,\s*|\s*;\s*/)
    .map(cleanProvisionalPdfLine)
    .filter((entry) => /^[\p{L}.'-]+(?:\s+[\p{L}.'-]+){1,4}$/u.test(entry))
    .slice(0, 8);
}

function extractProvisionalPdfTextMetadata({ fallbackTitle = '', pages = [] } = {}) {
  const lines = ensureTrimmedString(pages[0]?.text, '')
    .split(/\r?\n/)
    .map(cleanProvisionalPdfLine)
    .filter(Boolean)
    .filter((line) => !/^arxiv:|^doi:|^preprint|^submitted|^published/i.test(line));
  const abstractIndex = lines.findIndex((line) => /^abstract$/i.test(line));
  const leadingLines = lines.slice(0, abstractIndex >= 0 ? abstractIndex : Math.min(lines.length, 8));
  const authorIndex = leadingLines.findIndex((line, index) => index > 0 && parseProvisionalAuthorLine(line).length > 0);
  const title = cleanProvisionalPdfLine(
    leadingLines.slice(0, authorIndex >= 0 ? authorIndex : Math.min(leadingLines.length, 1)).join(' '),
  );
  const authors = authorIndex >= 0 ? parseProvisionalAuthorLine(leadingLines[authorIndex]) : [];

  return {
    authors,
    metadataSource: title || authors.length ? 'pdf-text-provisional' : '',
    metadataStatus: title || authors.length ? 'provisional' : '',
    title: title || titleFromFileName(fallbackTitle),
  };
}

function extractEmbeddedPdfMetadata(infoResult = {}) {
  const info = infoResult?.info || infoResult?.metadata || {};
  return {
    abstract: cleanMetadataText(info.Subject || info.subject || ''),
    authors: parseMetadataAuthorList(info.Author || info.author || ''),
    metadataSource: info.Title || info.Author || info.Subject ? 'pdf-metadata' : '',
    metadataStatus: info.Title || info.Author || info.Subject ? 'source' : '',
    title: cleanMetadataText(info.Title || info.title || ''),
  };
}

function extractArxivId(value = '') {
  const text = ensureTrimmedString(value, '');
  const match = text.match(/(?:arxiv[:/_-]?)?(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] || '';
}

function decodeXmlEntities(value = '') {
  return ensureString(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function readXmlTag(xml, tagName) {
  const match = ensureString(xml).match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return cleanMetadataText(decodeXmlEntities(match?.[1] || ''));
}

function readArxivAuthors(xml) {
  return Array.from(ensureString(xml).matchAll(/<author(?:\s[^>]*)?>[\s\S]*?<name(?:\s[^>]*)?>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi))
    .map((match) => cleanMetadataText(decodeXmlEntities(match[1] || '')))
    .filter(Boolean)
    .slice(0, 8);
}

function parseArxivAtomMetadata(xml) {
  const entry = ensureString(xml).match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1] || '';
  if (!entry) {
    return {};
  }
  const published = readXmlTag(entry, 'published');
  const year = Number(published.slice(0, 4)) || null;
  return {
    abstract: readXmlTag(entry, 'summary'),
    authors: readArxivAuthors(entry),
    metadataSource: 'arxiv',
    metadataStatus: 'source',
    title: readXmlTag(entry, 'title'),
    venue: readXmlTag(entry, 'journal_ref') || 'arXiv',
    year,
  };
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

const UNNUMBERED_SECTION_HEADING_PATTERN =
  /^(abstract|introduction|background|related work|method|methods|methodology|approach|model|models|experiments?|experimental setup|evaluation|results?|discussion|limitations?|conclusions?|future work|references|acknowledg(?:e)?ments?|appendix)$/i;

function detectHeading(line) {
  const text = ensureTrimmedString(line, '');
  if (!text) {
    return false;
  }

  if (UNNUMBERED_SECTION_HEADING_PATTERN.test(text)) {
    return true;
  }

  if (/^\d+(?:\.\d+)*\.?\s+[A-Z]/.test(text)) {
    return true;
  }

  return false;
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
  let leadingLines = [];

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
          lines: sections.length ? [] : leadingLines,
          pageEnd: page.num,
          pageStart: page.num,
        };
        leadingLines = [];
        continue;
      }

      if (!current) {
        if (!sections.length) {
          leadingLines.push(line);
          continue;
        }

        current = {
          label: `Section ${sections.length + 1}`,
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

  if (leadingLines.length) {
    const body = leadingLines.join(' ').trim();
    return [
      {
        id: 'abstract',
        label: 'Abstract',
        order: 0,
        pageEnd: pages.at(-1)?.num || 1,
        pageStart: pages[0]?.num || 1,
        status: 'done',
        summary: firstSentence(body, 'Abstract'),
      },
    ];
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

function splitPageLines(pageText) {
  return ensureTrimmedString(pageText, '')
    .split(/\r?\n/)
    .map((line, lineIndex) => ({ line: line.trim(), lineIndex }));
}

function parseAssetNumber(value, fallback = 1) {
  const match = ensureTrimmedString(value, '').match(/\d+/);
  return match ? Number(match[0]) || fallback : fallback;
}

function looksLikePunctuationFreeTableCaption(value) {
  const text = ensureTrimmedString(value, '');
  if (!text || !/^[A-Z0-9(]/.test(text)) {
    return false;
  }

  return !/^(?:shows?|reports?|summari[sz]es?|presents?|lists?|demonstrates?|illustrates?|compares?|provides?|contains?|describes?|uses?|is|are|was|were|can|will|may|might|would|should|we|the|a|an)\b/.test(text);
}

function findCaptionLines(pageText, kind) {
  const regex =
    kind === 'table'
      ? /^table\s+([A-Za-z]?\d+(?:\.\d+)?)(?:\s*([:.])\s*|\s+)(.+)$/i
      : /^fig(?:ure)?\.?\s+([A-Za-z]?\d+(?:\.\d+)?)\s*([:.])\s*(.+)$/i;
  return splitPageLines(pageText)
    .filter((entry) => entry.line)
    .map(({ line, lineIndex }) => {
      const match = line.match(regex);
      if (!match) {
        return null;
      }

      if (kind === 'table' && !match[2] && !looksLikePunctuationFreeTableCaption(match[3])) {
        return null;
      }

      const punctuation = match[2] === ':' ? ':' : '.';
      const number = parseAssetNumber(match[1], 1);
      return {
        caption: clipText(`${kind === 'table' ? 'Table' : 'Figure'} ${number}${punctuation} ${match[3]}`, 180),
        lineIndex,
        number,
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

function normaliseOcrPages(pages = [], sourceLabel = 'PDF OCR') {
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

const NUMBERISH_TABLE_VALUE = '[-+]?(?:(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\d+,\\d+)';
const NUMBERISH_TABLE_CELL = new RegExp(`^${NUMBERISH_TABLE_VALUE}(?:±${NUMBERISH_TABLE_VALUE})?%?$`);
const TABLE_DATA_VALUE = `(?:${NUMBERISH_TABLE_VALUE}(?:±${NUMBERISH_TABLE_VALUE})?%?|[-–—])`;
const TABLE_DATA_CELL = new RegExp(`^${TABLE_DATA_VALUE}$`);

function parseTableRow(line) {
  const text = ensureTrimmedString(line, '');
  if (!text) {
    return [];
  }

  if (text.includes('|')) {
    return text.split('|').map((cell) => cell.trim()).filter(Boolean);
  }

  if (text.includes('\t')) {
    return text.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  }

  if (/\s{2,}/.test(text)) {
    return text.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3 && tokens.every((token) => NUMBERISH_TABLE_CELL.test(token))) {
    return tokens;
  }

  const numericTail = text.match(
    new RegExp(`^(.+?)\\s+((?:${TABLE_DATA_VALUE}\\s+)+${TABLE_DATA_VALUE})$`),
  );
  if (numericTail) {
    const label = numericTail[1].trim();
    const values = numericTail[2].trim().split(/\s+/).filter((cell) => TABLE_DATA_CELL.test(cell));
    if (label && values.filter((cell) => NUMBERISH_TABLE_CELL.test(cell)).length >= 2) {
      return [label, ...values];
    }
  }

  return [];
}

function isMathHeavyTableRow(row) {
  const text = row.join(' ');
  const mathMarks = (text.match(/[=∼≈<>∂∆∇πμσλθ∝√∑∫[\]{}|]/g) || []).length;
  const wordMarks = (text.match(/[A-Za-z]{3,}/g) || []).length;
  return mathMarks >= 2 && wordMarks <= 2;
}

function isUsefulCaptionlessTableRows(rows) {
  if (rows.length < 3) {
    return false;
  }

  const mathHeavyRows = rows.filter(isMathHeavyTableRow).length;
  if (mathHeavyRows >= Math.ceil(rows.length / 2)) {
    return false;
  }

  const numericRows = rows.filter((row) => row.some((cell) => NUMBERISH_TABLE_CELL.test(cell))).length;
  return numericRows >= 2 || rows.some((row) => row.length >= 3);
}

function inferCaptionlessTableBlocks(pageText) {
  const lines = splitPageLines(pageText);
  const blocks = [];
  let activeRows = [];
  let activeStart = 0;

  const flush = () => {
    if (isUsefulCaptionlessTableRows(activeRows)) {
      blocks.push({
        lineIndex: activeStart,
        lineSpan: activeRows.length,
        rows: activeRows,
      });
    }
    activeRows = [];
    activeStart = 0;
  };

  for (const { line, lineIndex } of lines) {
    const row = parseTableRow(line);
    if (row.length >= 2) {
      if (!activeRows.length) {
        activeStart = lineIndex;
      }
      activeRows.push(row);
      continue;
    }
    flush();
  }

  flush();
  return blocks;
}

function inferCaptionedTableBlocks(pageText, tableCandidates) {
  const lines = splitPageLines(pageText);
  const captionStops = [...tableCandidates, ...findCaptionLines(pageText, 'figure')]
    .map((entry) => entry.lineIndex)
    .sort((a, b) => a - b);

  return tableCandidates
    .map((candidate) => {
      const nextCaptionLine = captionStops.find((lineIndex) => lineIndex > candidate.lineIndex);
      const endLine = Math.min(nextCaptionLine ?? lines.length, candidate.lineIndex + 32, lines.length);
      let rows = [];
      let firstRowLine = null;
      let lastRowLine = candidate.lineIndex;
      let nonRowAfterStart = 0;

      for (let index = candidate.lineIndex + 1; index < endLine; index += 1) {
        const line = lines[index]?.line || '';
        const row = parseTableRow(line);
        if (row.length >= 2) {
          rows.push(row);
          firstRowLine = firstRowLine ?? index;
          lastRowLine = index;
          nonRowAfterStart = 0;
          continue;
        }

        if (firstRowLine !== null) {
          if (!line) {
            break;
          }
          nonRowAfterStart += 1;
          if (nonRowAfterStart >= 2) {
            break;
          }
        }
      }

      if (!rows.length) {
        const previousCaptionLine = [...captionStops].reverse().find((lineIndex) => lineIndex < candidate.lineIndex);
        const startLine = Math.max(previousCaptionLine === undefined ? 0 : previousCaptionLine + 1, candidate.lineIndex - 16);

        for (let index = candidate.lineIndex - 1; index >= startLine; index -= 1) {
          const line = lines[index]?.line || '';
          const row = parseTableRow(line);
          if (row.length >= 2) {
            rows.unshift(row);
            firstRowLine = index;
            lastRowLine = candidate.lineIndex;
            continue;
          }

          if (rows.length || line) {
            break;
          }
        }
      }

      if (!rows.length) {
        return null;
      }

      return {
        caption: candidate.caption,
        lineIndex: firstRowLine ?? candidate.lineIndex,
        lineSpan: Math.max(1, lastRowLine - (firstRowLine ?? candidate.lineIndex) + 1),
        number: candidate.number,
        rows,
      };
    })
    .filter(Boolean);
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
    fullSummary: '',
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

export function createReadingService({
  agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
  agentRuntime = null,
  artifactStore = null,
  enableDemoPdf = false,
  fetchImpl = globalThis.fetch,
  ocrEngine = createTesseractOcrEngine(),
  ocrMaxPages = DEFAULT_OCR_MAX_PAGES,
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
  const artifacts = artifactStore || createLocalArtifactStore({ rootDir });

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
      readingSessionId: normalized.id,
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
      return createDemoPdfBuffer(session);
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

  async function fetchArxivMetadata(arxivId) {
    const id = extractArxivId(arxivId);
    if (!id || typeof fetchImpl !== 'function') {
      return {};
    }

    try {
      const response = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
      if (!response?.ok || typeof response.text !== 'function') {
        return {};
      }
      return parseArxivAtomMetadata(await response.text());
    } catch {
      return {};
    }
  }

  async function resolveUploadMetadata({ fileName = '', pdfUrl = '' } = {}) {
    const arxivId = extractArxivId(`${fileName} ${pdfUrl}`);
    return arxivId ? fetchArxivMetadata(arxivId) : {};
  }

  async function readInitialUploadedMetadata({ buffer, fileName = '', pdfUrl = '' } = {}) {
    const sourceMetadata = await resolveUploadMetadata({ fileName, pdfUrl });
    if (sourceMetadata.title || sourceMetadata.authors?.length) {
      return sourceMetadata;
    }

    const parser = pdfParseFactory({ data: buffer });
    try {
      const [textResult, infoResult] = await Promise.all([
        parser.getText({ parsePageInfo: true }).catch(() => ({ pages: [], text: '', total: 0 })),
        parser.getInfo({ parsePageInfo: true }).catch(() => ({ info: {}, pages: [], total: 0 })),
      ]);
      const embedded = extractEmbeddedPdfMetadata(infoResult);
      if (embedded.title || embedded.authors.length || embedded.abstract) {
        return embedded;
      }
      const pages = (textResult.pages || [])
        .map((page) => ({
          num: Number(page.num) || 1,
          text: ensureTrimmedString(page.text, ''),
        }))
        .filter((page) => page.text);
      return extractProvisionalPdfTextMetadata({ fallbackTitle: fileName, pages });
    } finally {
      await parser.destroy?.();
    }
  }

  async function applyExtractedPdfMetadata(session, { infoResult = {} } = {}) {
    const extracted = extractEmbeddedPdfMetadata(infoResult);
    const patch = {};
    if (extracted.title && extracted.title !== session.title) {
      patch.title = extracted.title;
    }
    if (extracted.authors.length) {
      patch.authors = extracted.authors;
    }
    if (extracted.abstract && !ensureTrimmedString(session.abstract, '')) {
      patch.abstract = extracted.abstract;
    }

    if (!Object.keys(patch).length) {
      return session;
    }

    const nextSession = await updateSession(session.id, patch);
    const currentPaper = store.getPaper(session.projectId, session.paperId) || {};
    const savedPaper = await store.savePaper(session.projectId, {
      ...currentPaper,
      ...patch,
      paperId: session.paperId,
      pdfUrl: session.pdfUrl,
      sourceName: session.sourceName,
      sourceProvider: session.sourceProvider,
    });
    await store.queuePaper(session.projectId, savedPaper, {
      sessionId: session.id,
      status: nextSession.status,
    });
    return nextSession;
  }

  async function applyAiPaperMetadata(session, raw = {}) {
    const patch = {
      metadataSource: '',
      metadataStatus: '',
    };
    const title = cleanMetadataText(raw.paperTitleEnglish || raw.title || raw.paperTitle || '');
    const authors = Array.isArray(raw.authors)
      ? raw.authors.map(cleanMetadataText).filter(Boolean).slice(0, 8)
      : parseMetadataAuthorList(raw.authors || '');

    if (title) {
      patch.title = title;
    }
    if (authors.length) {
      patch.authors = authors;
    }

    if (!patch.title && !patch.authors) {
      return session;
    }

    patch.metadataSource = 'ai-summary';
    patch.metadataStatus = 'ai';
    const nextSession = await updateSession(session.id, patch);
    const currentPaper = store.getPaper(session.projectId, session.paperId) || {};
    const savedPaper = await store.savePaper(session.projectId, {
      ...currentPaper,
      ...patch,
      paperId: session.paperId,
      pdfUrl: session.pdfUrl,
      sourceName: session.sourceName,
      sourceProvider: session.sourceProvider,
    });
    await store.queuePaper(session.projectId, savedPaper, {
      sessionId: session.id,
      status: nextSession.status,
    });
    return nextSession;
  }

  function scheduleUploadedSessionAnalysis(sessionId) {
    void (async () => {
      await serviceApi.analyzeSession(sessionId);
    })().catch(async (error) => {
      await updateSession(sessionId, {
        parseError: error instanceof Error ? error.message : String(error),
        parseFinishedAt: nowIso(),
        parseStatus: 'error',
        status: 'todo',
      }).catch(() => {});
    });
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
        const pageTableCandidates = tableCandidates.filter((entry) => entry.page === page.num);
        for (let index = 0; index < (page.tables || []).length; index += 1) {
          const rows = page.tables[index];
          const tableMeta = pageTableCandidates[index] || pageTableCandidates[0];
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
        const pageTableCandidates = tableCandidates.filter((entry) => entry.page === page.num);
        const tableBlocks = pageTableCandidates.length
          ? inferCaptionedTableBlocks(page.text, pageTableCandidates)
          : inferCaptionlessTableBlocks(page.text);
        if (!tableBlocks.length) {
          continue;
        }

        for (let index = 0; index < tableBlocks.length; index += 1) {
          const block = tableBlocks[index];
          const number = block.number || assets.filter((asset) => asset.kind === 'table').length + 1;
          const caption = block.caption || `Table ${number}`;
          const rows = block.rows;
          const dataPath = await writeJsonAsset(sessionId, `table-${page.num}-${number}.json`, rows);
          const sourceRegion = buildAssetSourceRegion(page.text, {
            lineIndex: block.lineIndex,
            lineSpan: Math.max(1, block.lineSpan || rows.length + 1),
            page: page.num,
            sourceText: [caption, ...rows.map((row) => row.join(' '))].join(' '),
          });
          assets.push({
            caption,
            dataPath,
            id: `table-${page.num}-${number}`,
            kind: 'table',
            number,
            page: page.num,
            rows,
            ...sourceRegion,
          });
        }
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
    const notes = Array.isArray(session.notes) ? session.notes : [];
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
    const citedChatCount = assistantMessages.filter((message) => Array.isArray(message.citations) && message.citations.length).length;
    const ocrProvenance = artifact.importProvenance || previous?.ocrProvenance || null;

    return {
      assetCount: assets.length,
      chunkCount: chunks.length,
      citedChatCount,
      figureCount: figures.length,
      generatedAt: nowIso(),
      ocrDurationMs: Number.isFinite(Number(ocrProvenance?.durationMs)) ? Number(ocrProvenance.durationMs) : null,
      ocrPageCount: Number(ocrProvenance?.pageCount) || 0,
      ocrProvenance,
      ocrTool: ocrProvenance?.tool || '',
      sectionCount: sections.length,
      sourceBoundedAssetCount: assets.filter((asset) => asset.sourceBounds?.unit === 'page-ratio').length,
      tableCount: tables.length,
    };
  }

  async function runRuntimeJsonTask(prompt) {
    if (!(await isRuntimeAvailable())) {
      return {
        payload: null,
        provenance: {
          generatedBy: '',
          runtimeError: 'agent runtime unavailable',
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
          generatedBy: 'agent-runtime',
          runtimeError: '',
          runtimeUsed: true,
        },
      };
    } catch (error) {
      const runtimeError = error instanceof Error ? error.message : String(error);
      return {
        payload: null,
        provenance: {
          generatedBy: '',
          runtimeError,
          runtimeUsed: true,
        },
      };
    }
  }

  function normaliseAgentSummaryCards(raw) {
    const sectionSummaries = Array.isArray(raw?.sectionSummaries)
      ? raw.sectionSummaries
          .map((entry, index) => ({
            id: ensureTrimmedString(entry?.id, `section-summary-${index + 1}`),
            label: ensureTrimmedString(entry?.label, `Section ${index + 1}`),
            page: entry?.page ?? null,
            sectionId: ensureTrimmedString(entry?.sectionId, ''),
            summary: clipText(entry?.summary, 260),
          }))
          .filter((entry) => entry.summary)
      : [];
    const summaryCards = {
      fullSummary: ensureTrimmedString(raw?.fullSummary, ''),
      keyPoints: Array.isArray(raw?.keyPoints) ? raw.keyPoints.map((entry) => clipText(entry, 180)).filter(Boolean) : [],
      limit: clipText(raw?.limit, 320),
      method: clipText(raw?.method, 320),
      result: clipText(raw?.result, 320),
      sectionSummaries,
      tldr: clipText(raw?.tldr, 320),
    };
    const hasSummary =
      summaryCards.fullSummary ||
      summaryCards.tldr ||
      summaryCards.method ||
      summaryCards.result ||
      summaryCards.limit ||
      summaryCards.keyPoints.length ||
      summaryCards.sectionSummaries.length;
    return hasSummary ? summaryCards : null;
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
Return JSON only with keys: paperTitleEnglish, authors, fullSummary, tldr, keyPoints, method, result, limit, sectionSummaries.

Paper title: ${session.title}
Authors: ${(session.authors || []).join(', ') || 'Unknown authors'}
Venue/year: ${[session.venue, session.year].filter(Boolean).join(', ') || 'Unknown'}
Abstract: ${session.abstract}
Existing summary: ${session.summary}

Sections:
${sectionContext}

Evidence:
${chunkContext}

Prompt:
당신은 AI 분야 연구논문 요약 정리기입니다. 아래 지시에 맞게 논문 내용을 요약 정리한 자료를 만드세요.

가장 먼저 논문 제목을 영어 원문 및 번역문으로 작성하세요.

[내용 구성]
1. 논문 내용 요약 및 핵심 정리
- 논문이 작성되거나 출판된 연도 및 저널을 작성하세요.
- 논문 저자가 소속된 대학이나 기업을 작성하세요.
- 논문 내용의 5개의 주요 키워드를 영어로 도출하세요.
- 논문의 Abstract를 원문 그대로 인용하고 바로 아래에 한국어 번역을 제공하세요.
- 연구의 주요 목적, 방법론, 핵심 발견점을 200-250단어로 간결하게 요약하세요.
- 논문이 해결하고자 하는 문제와 기존 접근법의 한계점을 명확히 설명하세요.
- 저자들이 제안한 새로운 방법, 모델, 기술의 핵심 차별점을 강조하세요.

2. 목차 및 내용 정리
- 1~5까지의 목차를 작성하세요. 각 목차 앞에는 어울리는 이모지를 포함하세요.
- 각 목차별로 논문의 내용을 글머리 기호로 상세하게 정리하세요.
- 각 목차별 하위 단락도 글머리 기호로 작성하세요. 예: 1.6. LLM 에이전트의 구성과 프로필 정의
- 논문의 흐름을 이해하기 쉽도록 각 문장을 충분한 길이로 작성하세요.
- 필요하다면 적절한 도표나 수식 등을 제시하세요.

3. 논문에서 반드시 알아야 하는 내용
- 제안된 방법론의 핵심을 이해하기 쉽게 설명하세요.
- 도표를 사용해서 논문에 언급된 주요 수치를 제시하세요.
- 논문에 나타난 그림이나 도표를 언급하고 의미를 해석하세요.
- 실험 설계 및 평가 방법을 설명하세요.
- 주요 성능 지표와 비교 대상 모델들과의 차이점을 강조하세요.

4. 결론
- 논문의 Conclusion 섹션을 원문 그대로 인용하고 한국어로 번역하세요.
- 이 연구가 AI 분야에 미치는 영향과 의의를 분석하세요.
- 연구의 한계점과 저자들이 제시한 향후 연구 방향을 정리하세요.
- 이 연구와 관련한 향후 연구 방향에 대한 전문가로서의 고찰을 300단어 내외로 제시하세요.
- 연구적 관점에서 이 논문이 갖는 의의와 기여를 설명하세요.
- 이 기술이 앞으로 어떻게 발전할 수 있고 어떤 산업이나 분야에 응용될 수 있는지 설명하세요.
- 현재 한계점을 극복하기 위한 가능한 접근법을 제시하세요.
- 이 논문에서 도출할 수 있는 향후 연구과제를 정리하세요.

5. 최종 요약
- Background
- Method
- Result
- Limitation & Discussion
- Conclusion

[형식 지침]
- fullSummary는 총 1,000-1,500단어 정도의 자연스러운 한국어 Markdown으로 작성하세요.
- 중요한 핵심 개념이나 발견점은 굵은 글씨로 강조하세요.
- 전문 용어는 필요한 경우 간략한 설명을 함께 제공하세요.
- 제목이나 단락 등에 이모지를 충분히 사용하세요.
- 독자는 AI 분야의 학생입니다. 이해하기 쉽게 작성하세요.
- 번역 시 원문의 의미를 정확히 전달하되, 자연스러운 한국어로 번역하세요.
- 결과물은 자연스러운 한국어로 작성하세요.

JSON field rules:
- paperTitleEnglish is the paper title in its original English form when the evidence supports it.
- authors is an array of author names when the evidence supports them.
- fullSummary contains the complete Korean Markdown answer above.
- tldr, method, result, limit are Korean strings under 360 characters each for compact cards.
- keyPoints is an array of 3-5 Korean strings.
- sectionSummaries is an array of objects with sectionId, label, page, summary.
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

  function buildChatPrompt(session, message, selection) {
    const selectionContext = selection
      ? `Primary selected PDF text (treat this as the active user-selected passage):\n- quote: ${selection.quote}\n- page: ${selection.page || ''}\n- lines: ${selection.lineCount || ''}\n`
      : 'Primary selected PDF text: none\n';

    return `
Return JSON only with keys: answer, citations.

PDF location:
- title: ${session.title || ''}
- paperUrl: ${session.paperUrl || ''}
- pdfUrl: ${session.pdfUrl || ''}
- cachedPdfPath: ${session.pdfCachePath || ''}
- parsedArtifactPath: ${session.parsedArtifactPath || ''}
${selectionContext}
User question:
${message}

Rules:
- Use the PDF location and selected passage to answer the user.
- For requests like "translate this", "이 내용 번역", "selected text", or "선택한 부분", answer about the selected passage itself.
- When translating, translate the selected quote faithfully and do not substitute nearby chunks.
- citations must be an array of objects with label, page, quote, sectionId.
`.trim();
  }

  const serviceApi = {
    async listProjectSessions(projectId) {
      return store.getReadingSessions(projectId).map((session) => normaliseReadingSession(session));
    },

    async createSession({ display = null, paper, projectId, runId = '', status = 'todo', summary = '' } = {}) {
      if (!paper) {
        throw new Error('paper is required to create a reading session.');
      }

      const existing = store.getReadingSessionByPaper(projectId, paper.paperId);
      const seed = buildReadingSessionSeed(projectId, paper, {
        display,
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

    async createUploadedSession({ autoAnalyze = true, contentBase64, contentBuffer, fileName = 'upload.pdf', projectId, title = '' } = {}) {
      if (!projectId) {
        throw new Error('projectId is required.');
      }

      const buffer = decodeUploadedPdf({ contentBase64, contentBuffer });
      const safeFileName = slugFileName(fileName);
      const paperId = `upload-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const pdfUrl = `uploaded://${paperId}/${encodeURIComponent(safeFileName)}`;
      const sourceMetadata = await readInitialUploadedMetadata({ buffer, fileName: safeFileName, pdfUrl });
      const paperTitle = ensureTrimmedString(title || sourceMetadata.title, titleFromFileName(safeFileName));
      const timestamp = nowIso();
      const paper = {
        abstract: sourceMetadata.abstract || '',
        authors: sourceMetadata.authors || [],
        citedByCount: 0,
        keyPoints: [],
        keywords: [],
        matchedKeywords: [],
        openAccess: true,
        paperId,
        paperUrl: null,
        pdfUrl,
        relevance: 0,
        sourceName: safeFileName,
        sourceProvider: 'upload',
        summary: '',
        title: paperTitle,
        venue: sourceMetadata.venue || 'Uploaded PDF',
        year: sourceMetadata.year || null,
      };

      const savedPaper = await store.savePaper(projectId, paper);
      const seed = buildReadingSessionSeed(projectId, savedPaper, {
        createdAt: timestamp,
        sourceRefs: [{ id: paperId, type: 'upload', label: safeFileName }],
        status: autoAnalyze ? 'running' : 'todo',
      });
      const session = normaliseReadingSession(seed);
      const pdfCachePath = await writeBinaryAsset(session.id, 'source.pdf', buffer);
      const nextSession = await store.upsertReadingSession(
        normaliseReadingSession(
          {
            ...session,
            metadataSource: sourceMetadata.metadataSource || '',
            metadataStatus: sourceMetadata.metadataStatus || '',
            pdfCachePath,
            parseStartedAt: autoAnalyze ? timestamp : null,
            parseStatus: autoAnalyze ? 'running' : 'idle',
          },
          { existing: session },
        ),
      );
      await syncReadingPacket(nextSession);

      await store.queuePaper(projectId, savedPaper, {
        sessionId: nextSession.id,
        status: nextSession.status,
      });

      if (autoAnalyze) {
        scheduleUploadedSessionAnalysis(nextSession.id);
      }

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
            const sourceLabel = 'PDF OCR';
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

        const metadataSession = await applyExtractedPdfMetadata(initial, { infoResult });

        return materializeParsedSession(metadataSession, {
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

    async analyzeSession(sessionId, { refresh = false } = {}) {
      let payload = { session: await getSessionOrThrow(sessionId) };

      if (refresh || payload.session.parseStatus !== 'done' || !payload.session.parsedArtifactPath) {
        payload = await serviceApi.parseSession(sessionId);
      }

      if (payload.session.parseStatus !== 'done' || !payload.session.parsedArtifactPath) {
        return payload;
      }

      if (refresh || payload.session.summaryStatus !== 'done') {
        payload = await serviceApi.summarizeSession(sessionId);
      }

      const current = await getSessionOrThrow(sessionId);
      if (refresh || !current.assets.length) {
        return serviceApi.extractAssets(sessionId);
      }

      return { session: current };
    },

    async summarizeSession(sessionId) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Analyze the paper before generating a summary.');
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

      const generated = await runRuntimeJsonTask(buildSummaryPrompt(running, artifact));
      if (!generated.payload) {
        const failed = await updateSession(sessionId, {
          keyPoints: [],
          summary: null,
          summaryCards: null,
          summaryError: generated.provenance.runtimeError || 'AI summary generation failed.',
          summaryFinishedAt: nowIso(),
          summaryGeneratedBy: '',
          summaryRuntimeUsed: false,
          summaryStatus: 'error',
        });
        return { session: failed };
      }

      const raw = generated.payload || {};
      const summaryCards = normaliseAgentSummaryCards(raw);
      if (!summaryCards) {
        const failed = await updateSession(sessionId, {
          keyPoints: [],
          summary: null,
          summaryCards: null,
          summaryError: 'AI summary generation failed.',
          summaryFinishedAt: nowIso(),
          summaryGeneratedBy: '',
          summaryRuntimeUsed: generated.provenance.runtimeUsed,
          summaryStatus: 'error',
        });
        return { session: failed };
      }
      const metadataSession = await applyAiPaperMetadata(running, raw);
      const next = await updateSession(sessionId, {
        keyPoints: summaryCards.keyPoints,
        summary: clipText(summaryCards.tldr, 320),
        summaryCards,
        summaryError: '',
        summaryFinishedAt: nowIso(),
        summaryGeneratedBy: generated.provenance.generatedBy,
        summaryRuntimeUsed: generated.provenance.runtimeUsed,
        summaryStatus: 'done',
        title: metadataSession.title,
        authors: metadataSession.authors,
        metadataSource: metadataSession.metadataSource,
        metadataStatus: metadataSession.metadataStatus,
      });

      return { session: next };
    },

    async extractAssets(sessionId) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Analyze the paper before extracting figures and tables.');
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

    async chat(sessionId, { message, selection: selectionInput = null } = {}) {
      const session = await getSessionOrThrow(sessionId);
      if (session.parseStatus !== 'done' || !session.parsedArtifactPath) {
        throw new Error('Analyze the paper before asking questions.');
      }

      const prompt = ensureTrimmedString(message, '');
      if (!prompt) {
        throw new Error('message is required.');
      }

      const artifact = await readParsedArtifact(session);
      if (!artifact) {
        throw new Error('Parsed artifact is missing for this session.');
      }

      const selection = normaliseChatSelection(selectionInput);
      const generated = await runRuntimeJsonTask(
        buildChatPrompt(session, prompt, selection),
      );
      if (!generated?.payload) {
        throw new Error(`AI chat generation failed: ${generated?.provenance?.runtimeError || 'agent runtime unavailable'}`);
      }
      const raw = generated.payload || {};
      const provenance = generated.provenance;

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
          : [],
        createdAt: nowIso(),
        generatedBy: provenance.generatedBy,
        id: `chat-assistant-${Date.now()}`,
        role: 'assistant',
        text: clipText(raw?.answer || '', 480),
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

  return serviceApi;
}
