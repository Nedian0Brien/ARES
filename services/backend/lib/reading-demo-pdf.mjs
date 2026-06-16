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
      contentLines.push(`(${escapePdfText(line)}) Tj`);
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
    `${title} is prepared as a sample reading session for the demo workspace.`,
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
      ...wrapText('The workflow caches the PDF, extracts page-level text, detects section boundaries, and stores passages for evidence-based reader chat.', 76),
      '',
      '3 Results',
      ...wrapText(firstSentence(keyPoints[2], abstract), 76),
      'Figure 1. Adaptive skip policy overview.',
      ...wrapText('The policy estimates confidence, decides whether to trigger reranking, and records the supporting evidence for later inspection.', 76),
    ],
    [
      '4 Limitations',
      ...wrapText('Scanned image-only PDFs need extracted text before Reading can analyze them. Import OCR text to continue.', 76),
      '',
      '5 Reproducibility',
      ...wrapText('Key implementation parameters and follow-up highlights are extracted during parse so Research can inherit them without a separate handoff format.', 76),
      '',
      'Table 1. Efficiency comparison.',
      'System      Latency(ms)      Quality',
      'Baseline    120              84.1',
      'Adaptive     78              83.8',
    ],
  ];
}

export function createDemoPdfBuffer(session) {
  return buildSimplePdfBuffer(buildDemoPdfPages(session));
}
