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

function pdfLine(value, options = {}) {
  if (value && typeof value === 'object') {
    return value;
  }
  return { text: ensureString(value), ...options };
}

function buildSimplePdfBuffer(pages) {
  const objects = [
    null,
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>',
  ];
  const pageIds = [];

  for (const pageLines of pages) {
    const contentLines = [
      'BT',
      '/F1 11 Tf',
      '14 TL',
      '62 747 Td',
    ];

    pageLines.forEach((line, index) => {
      const entry = pdfLine(line);
      if (entry.font) {
        contentLines.push(`/${entry.font} ${Number(entry.size) || 11} Tf`);
      }
      contentLines.push(`(${escapePdfText(entry.text)}) Tj`);
      if (index < pageLines.length - 1) {
        const gap = Number(entry.gap || entry.after || 0);
        if (gap) {
          contentLines.push(`0 -${gap} Td`);
        } else {
          contentLines.push('T*');
        }
      }
    });

    contentLines.push('ET');
    const stream = contentLines.join('\n');
    const streamObject = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
    objects.push(streamObject);
    const contentId = objects.length;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
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
  const authors = ensureTrimmedString(session.display?.pdfAuthors, '') || (Array.isArray(session.authors) && session.authors.length
    ? session.authors.join(', ')
    : 'Authors not provided');
  const venue = ensureTrimmedString(session.display?.pdfVenue, '') || [session.venue, session.year].filter(Boolean).join(' · ') || 'Venue not provided';
  const keywordLine = Array.isArray(session.keywords) && session.keywords.length
    ? `Keywords: ${session.keywords.slice(0, 5).join(', ')}`
    : '';
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

  const pages = [
    [
      ...wrapText(title, 62).map((text, index, lines) => pdfLine(text, {
        font: 'F2',
        size: 15,
        ...(index === lines.length - 1 ? { gap: 22 } : {}),
      })),
      pdfLine(authors, { font: 'F1', size: 10, gap: 18 }),
      pdfLine(venue, { font: 'F1', size: 10, gap: 22 }),
      pdfLine('Abstract', { font: 'F2', size: 11, gap: 15 }),
      ...wrapText(abstract, 88).map((text) => pdfLine(text, { font: 'F1', size: 11 })),
      pdfLine('', { gap: 15 }),
      ...wrapText(firstSentence(keyPoints[0], abstract), 88).map((text) => pdfLine(text, { font: 'F1', size: 11 })),
      pdfLine('', { gap: 16 }),
      pdfLine('1. Introduction', { font: 'F2', size: 12, gap: 15 }),
      ...wrapText('This demo PDF is generated locally so the Reading pipeline can exercise cache, parse, summary, and viewer flows without depending on external hosts.', 88).map((text) => pdfLine(text, { font: 'F1', size: 11 })),
      keywordLine ? pdfLine(keywordLine, { font: 'F1', size: 10 }) : null,
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
  const pageCount = Math.max(pages.length, Number(session.pageCount) || pages.length);

  for (let index = pages.length + 1; index <= pageCount; index += 1) {
    pages.push([
      `${index} Appendix`,
      ...wrapText(`${title} supporting material page ${index}.`, 76),
      '',
      ...wrapText('Additional evaluation notes are available in the Reading session metadata and extracted assets.', 76),
    ]);
  }

  return pages;
}

export function createDemoPdfBuffer(session) {
  return buildSimplePdfBuffer(buildDemoPdfPages(session));
}
