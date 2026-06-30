const ENGLISH_WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const MAX_SELECTION_RECTS = 24;

export function segmentWords(text) {
  const value = String(text || '');
  const words = [];
  for (const match of value.matchAll(ENGLISH_WORD_PATTERN)) {
    words.push({
      end: match.index + match[0].length,
      index: match.index,
      text: match[0],
    });
  }
  return words;
}

function resolveWordPosition(words, value) {
  const directIndex = words.findIndex((word) => word.globalIndex === value);
  if (directIndex >= 0) return directIndex;
  return Math.min(words.length - 1, Math.max(0, Number(value) || 0));
}

function wordIndex(word, fallback) {
  return Number.isFinite(Number(word?.globalIndex)) ? Number(word.globalIndex) : fallback;
}

function selectionBlockIndex(word) {
  return Number.isFinite(Number(word?.blockIndex)) ? Number(word.blockIndex) : word?.paragraphIndex;
}

function selectionLineSeparated(word, anchor) {
  const wordLeft = Number.isFinite(Number(word?.lineLeft)) ? Number(word.lineLeft) : word?.rect?.left;
  const wordRight = Number.isFinite(Number(word?.lineRight)) ? Number(word.lineRight) : word?.rect?.right;
  const anchorLeft = Number.isFinite(Number(anchor?.lineLeft)) ? Number(anchor.lineLeft) : anchor?.rect?.left;
  const anchorRight = Number.isFinite(Number(anchor?.lineRight)) ? Number(anchor.lineRight) : anchor?.rect?.right;
  if (![wordLeft, wordRight, anchorLeft, anchorRight].every((value) => Number.isFinite(Number(value)))) {
    return false;
  }
  const gapTolerance = Math.max(20, Math.min(word?.rect?.height || 0, anchor?.rect?.height || 0) * 2);
  return wordLeft > anchorRight + gapTolerance || anchorLeft > wordRight + gapTolerance;
}

function sameSelectionBlock(word, anchor) {
  return (
    selectionBlockIndex(word) === selectionBlockIndex(anchor) &&
    word.columnIndex === anchor.columnIndex &&
    !selectionLineSeparated(word, anchor)
  );
}

export function resolveSmartWordRange({ anchorIndex, focusIndex, raw = false, words }) {
  if (!Array.isArray(words) || !words.length) {
    return null;
  }

  const anchorPosition = resolveWordPosition(words, anchorIndex);
  const focusPosition = resolveWordPosition(words, focusIndex);
  const anchor = words[anchorPosition];
  const focus = words[focusPosition];
  if (!anchor || !focus) {
    return null;
  }

  if (raw || sameSelectionBlock(focus, anchor)) {
    const startPosition = Math.min(anchorPosition, focusPosition);
    const endPosition = Math.max(anchorPosition, focusPosition);
    return {
      clamped: false,
      endIndex: wordIndex(words[endPosition], endPosition),
      endPosition,
      startIndex: wordIndex(words[startPosition], startPosition),
      startPosition,
    };
  }

  const sameParagraph = words
    .map((word, index) => ({ index, word }))
    .filter((entry) => sameSelectionBlock(entry.word, anchor));
  const startPosition = focusPosition < anchorPosition
    ? sameParagraph[0].index
    : anchorPosition;
  const endPosition = focusPosition < anchorPosition
    ? anchorPosition
    : sameParagraph[sameParagraph.length - 1].index;

  return {
    clamped: true,
    endIndex: wordIndex(words[endPosition], endPosition),
    endPosition,
    startIndex: wordIndex(words[startPosition], startPosition),
    startPosition,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceToRect(x, y, rect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceToRectCenter(x, y, rect) {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  return Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
}

function elementFromSelectionNode(node) {
  return node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function caretFromPoint(x, y) {
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      return { node: position.offsetNode, offset: position.offset };
    }
  }
  if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

function textNodeForSpan(span) {
  return Array.from(span.childNodes).find((node) => node.nodeType === Node.TEXT_NODE) || null;
}

function rectFromDomRect(rect) {
  return rect ? {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  } : null;
}

function isRotatedTransform(transform) {
  const match = String(transform || '').match(/^matrix\(([^)]+)\)$/);
  if (!match) return false;
  const values = match[1].split(',').map((value) => Number(value.trim()));
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    return false;
  }
  return Math.abs(values[1]) > 0.2 || Math.abs(values[2]) > 0.2;
}

export function isPdfTextRunArtifact({ rect, text = '', transform = '' } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || !rect?.width || !rect?.height) return false;

  const rotated = isRotatedTransform(transform);
  const tallNarrow = rect.height > Math.max(48, rect.width * 3);
  const arxivMarginLabel = /^arXiv:\d{4}\.\d+/i.test(value);

  return (rotated && tallNarrow) || (arxivMarginLabel && tallNarrow);
}

function rectForTextRun(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const rects = Array.from(range.getClientRects()).filter((entry) => entry.width > 0 && entry.height > 0);
  range.detach?.();
  if (!rects.length) return null;
  return {
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
    height: Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)),
    left: Math.min(...rects.map((rect) => rect.left)),
    right: Math.max(...rects.map((rect) => rect.right)),
    top: Math.min(...rects.map((rect) => rect.top)),
    width: Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left)),
  };
}

function locateRunOffset(runs, offset, preferEnd = false) {
  const clampedOffset = Math.max(0, Number(offset) || 0);
  const direct = runs.find((run) => (
    preferEnd
      ? clampedOffset > run.globalStart && clampedOffset <= run.globalEnd
      : clampedOffset >= run.globalStart && clampedOffset < run.globalEnd
  ));
  if (direct) {
    return {
      node: direct.node,
      offset: clamp(clampedOffset - direct.globalStart, 0, direct.text.length),
      runIndex: direct.runIndex,
    };
  }

  const fallback = preferEnd ? runs.at(-1) : runs[0];
  if (!fallback) return null;
  return {
    node: fallback.node,
    offset: preferEnd ? fallback.text.length : 0,
    runIndex: fallback.runIndex,
  };
}

function shouldInsertRunSeparator(previousRun, run) {
  if (!previousRun?.text || !run?.text) return false;
  if (/\s$/.test(previousRun.text) || /^\s/.test(run.text) || /[-‐‑‒–—]$/.test(previousRun.text)) {
    return false;
  }

  const previousRect = previousRun.rect;
  const rect = run.rect;
  if (!previousRect || !rect) return false;

  const smallerHeight = Math.max(1, Math.min(previousRect.height || 0, rect.height || 0));
  const previousCenterY = (previousRect.top + previousRect.bottom) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const verticalShift = Math.abs(centerY - previousCenterY) > smallerHeight * 0.65;
  if (verticalShift) return true;

  const horizontalGap = rect.left - previousRect.right;
  return horizontalGap > smallerHeight * 0.28;
}

export function mapWordsToTextRuns(textRuns) {
  const runs = [];
  let pageText = '';
  let previousRun = null;

  textRuns.forEach((run, runIndex) => {
    const text = String(run?.text || '');
    if (!text) return;
    if (shouldInsertRunSeparator(previousRun, run)) {
      pageText += ' ';
    }
    runs.push({
      ...run,
      globalEnd: pageText.length + text.length,
      globalStart: pageText.length,
      runIndex,
      text,
    });
    pageText += text;
    previousRun = runs.at(-1);
  });

  return segmentWords(pageText)
    .map((word) => {
      const start = locateRunOffset(runs, word.index, false);
      const end = locateRunOffset(runs, word.end, true);
      if (!start || !end) return null;
      return {
        endOffset: end.offset,
        endRunIndex: end.runIndex,
        globalTextEnd: word.end,
        globalTextStart: word.index,
        startOffset: start.offset,
        startRunIndex: start.runIndex,
        text: word.text,
      };
    })
    .filter(Boolean);
}

function buildLineGroups(words) {
  const lines = [];
  const sorted = [...words].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  sorted.forEach((word) => {
    const centerY = (word.rect.top + word.rect.bottom) / 2;
    const line = lines.find((candidate) => {
      const candidateCenterY = (candidate.top + candidate.bottom) / 2;
      const verticalTolerance = Math.max(3, Math.min(candidate.height, word.rect.height) * 0.55);
      const horizontalTolerance = Math.max(10, Math.min(candidate.height, word.rect.height));
      const horizontallyNear = (
        word.rect.left <= candidate.right + horizontalTolerance &&
        word.rect.right >= candidate.left - horizontalTolerance
      );
      return Math.abs(candidateCenterY - centerY) <= verticalTolerance && horizontallyNear;
    });

    if (line) {
      line.words.push(word);
      line.top = Math.min(line.top, word.rect.top);
      line.bottom = Math.max(line.bottom, word.rect.bottom);
      line.left = Math.min(line.left, word.rect.left);
      line.right = Math.max(line.right, word.rect.right);
      line.height = Math.max(line.height, word.rect.height);
      return;
    }

    lines.push({
      bottom: word.rect.bottom,
      height: word.rect.height,
      left: word.rect.left,
      right: word.rect.right,
      top: word.rect.top,
      width: word.rect.width,
      words: [word],
    });
  });

  return lines
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((line, index) => {
      line.index = index;
      line.width = line.right - line.left;
      line.words.sort((a, b) => a.rect.left - b.rect.left);
      line.words.forEach((word) => {
        word.lineIndex = index;
        word.lineLeft = line.left;
        word.lineRight = line.right;
      });
      return line;
    });
}

function buildColumnGroups(lines) {
  if (!lines.length) return [];

  const left = Math.min(...lines.map((line) => line.left));
  const right = Math.max(...lines.map((line) => line.right));
  const textWidth = Math.max(1, right - left);
  const candidates = lines.filter((line) => line.width <= textWidth * 0.62);
  const columns = [];

  candidates
    .sort((a, b) => a.left - b.left)
    .forEach((line) => {
      const column = columns.find((candidate) => Math.abs(candidate.left - line.left) < Math.max(48, line.height * 4));
      if (column) {
        column.left = Math.min(column.left, line.left);
        column.right = Math.max(column.right, line.right);
        column.count += 1;
        return;
      }

      columns.push({
        count: 1,
        left: line.left,
        right: line.right,
      });
    });

  if (!columns.length) {
    return [{ count: lines.length, left, right }];
  }

  const sortedColumns = columns.sort((a, b) => a.left - b.left);
  const recurringThreshold = Math.max(3, Math.floor(lines.length * 0.08));
  const recurringColumns = sortedColumns.filter((column) => column.count >= recurringThreshold);

  return recurringColumns.length ? recurringColumns : sortedColumns;
}

function assignLineColumns(lines) {
  const columns = buildColumnGroups(lines);

  lines.forEach((line) => {
    const lineCenter = (line.left + line.right) / 2;
    const best = columns.reduce((current, column, index) => {
      const columnCenter = (column.left + column.right) / 2;
      const distance = Math.abs(lineCenter - columnCenter);
      return distance < current.distance ? { distance, index } : current;
    }, { distance: Infinity, index: 0 });
    line.columnIndex = best.index;
    line.words.forEach((word) => {
      word.columnIndex = best.index;
    });
  });
}

function assignParagraphs(words) {
  const lines = buildLineGroups(words);
  assignLineColumns(lines);
  let paragraphIndex = 0;
  const columnIndexes = [...new Set(lines.map((line) => line.columnIndex))].sort((a, b) => a - b);
  let hasAssignedBlock = false;

  columnIndexes.forEach((columnIndex) => {
    const columnLines = lines
      .filter((line) => line.columnIndex === columnIndex)
      .sort((a, b) => a.top - b.top || a.left - b.left);
    let previousLine = null;

    if (hasAssignedBlock && columnLines.length) {
      paragraphIndex += 1;
    }

    columnLines.forEach((line) => {
      if (previousLine) {
        const gap = line.top - previousLine.bottom;
        const lineHeight = Math.max(previousLine.height, line.height);
        const smallerLineHeight = Math.max(1, Math.min(previousLine.height, line.height));
        const leftShift = Math.abs(line.left - previousLine.left);
        const heightShift = Math.abs(line.height - previousLine.height);
        const sameVerticalBand = line.top < previousLine.bottom + lineHeight * 0.35;
        const columnJump = sameVerticalBand && line.left > previousLine.right + lineHeight * 4;
        const shiftedBlockBreak = gap > Math.max(3, smallerLineHeight * 0.25) && leftShift > smallerLineHeight * 0.65;
        const fontBlockBreak = gap > Math.max(4, smallerLineHeight * 0.35) && heightShift > smallerLineHeight * 0.18;
        if (gap > Math.max(5, lineHeight * 0.55) || columnJump || shiftedBlockBreak || fontBlockBreak) {
          paragraphIndex += 1;
        }
      }

      line.words.forEach((word) => {
        word.blockIndex = paragraphIndex;
        word.paragraphIndex = paragraphIndex;
      });
      previousLine = line;
      hasAssignedBlock = true;
    });
  });
}

function buildPageSelectionModel(pageNode) {
  const spans = Array.from(pageNode.querySelectorAll('.reading-pdf-text-layer span:not(.markedContent)'));
  const words = [];
  const textRuns = spans
    .map((span) => {
      const node = textNodeForSpan(span);
      const rect = span.getBoundingClientRect?.();
      const run = node ? {
        node,
        rect: rectFromDomRect(rect),
        span,
        text: node.textContent,
        transform: window.getComputedStyle?.(span)?.transform || '',
      } : null;
      if (!run) return null;

      if (isPdfTextRunArtifact(run)) {
        span.dataset.pdfSelectionArtifact = 'true';
        span.style.pointerEvents = 'none';
        span.style.userSelect = 'none';
        return null;
      }

      delete span.dataset.pdfSelectionArtifact;
      return run;
    })
    .filter(Boolean);

  mapWordsToTextRuns(textRuns).forEach((word) => {
    const startRun = textRuns[word.startRunIndex];
    const endRun = textRuns[word.endRunIndex];
    if (!startRun?.node || !endRun?.node) return;

    const rect = rectForTextRun(startRun.node, word.startOffset, endRun.node, word.endOffset);
    if (!rect) return;
    words.push({
      endNode: endRun.node,
      endOffset: word.endOffset,
      globalIndex: words.length,
      pageNode,
      rect: {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      },
      startNode: startRun.node,
      startOffset: word.startOffset,
      text: word.text,
    });
  });

  assignParagraphs(words);
  return { pageNode, words };
}

function wordFromCaret(model, caret) {
  if (!caret?.node) return null;
  const candidates = model.words.filter((word) => word.startNode === caret.node || word.endNode === caret.node);
  if (!candidates.length) return null;
  return candidates.find((word) => (
    word.startNode === word.endNode &&
    caret.offset >= word.startOffset &&
    caret.offset <= word.endOffset
  ))
    || candidates.reduce((best, word) => {
      const distance = Math.min(Math.abs(caret.offset - word.startOffset), Math.abs(caret.offset - word.endOffset));
      return distance < best.distance ? { distance, word } : best;
    }, { distance: Infinity, word: null }).word;
}

function wordFromPoint(model, x, y) {
  const contained = model.words.filter((word) => (
    x >= word.rect.left - 2 &&
    x <= word.rect.right + 2 &&
    y >= word.rect.top - 3 &&
    y <= word.rect.bottom + 3
  ));
  if (contained.length) {
    return contained.reduce((best, word) => {
      const distance = distanceToRectCenter(x, y, word.rect);
      const area = word.rect.width * word.rect.height;
      if (distance < best.distance || (distance === best.distance && area < best.area)) {
        return { area, distance, word };
      }
      return best;
    }, { area: Infinity, distance: Infinity, word: null }).word;
  }

  const caretWord = wordFromCaret(model, caretFromPoint(x, y));
  if (caretWord) return caretWord;

  return model.words.reduce((best, word) => {
    const distance = distanceToRect(x, y, word.rect);
    return distance < best.distance ? { distance, word } : best;
  }, { distance: Infinity, word: null }).word;
}

function selectionBlockWords(model, anchorWord) {
  return model.words.filter((word) => sameSelectionBlock(word, anchorWord));
}

function selectionBlockBounds(words) {
  if (!words.length) return null;
  return {
    bottom: Math.max(...words.map((word) => word.rect.bottom)),
    left: Math.min(...words.map((word) => word.rect.left)),
    right: Math.max(...words.map((word) => word.rect.right)),
    top: Math.min(...words.map((word) => word.rect.top)),
  };
}

function setNativeWordSelection(startWord, endWord) {
  if (!startWord || !endWord) return false;
  const selection = window.getSelection?.();
  if (!selection) return false;

  const range = document.createRange();
  range.setStart(startWord.startNode, startWord.startOffset);
  range.setEnd(endWord.endNode, endWord.endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function clippedSelectionRects(selection, surfaceRect) {
  if (!selection?.rangeCount || !surfaceRect?.width || !surfaceRect?.height) {
    return [];
  }

  return Array.from(selection.getRangeAt(0).getClientRects?.() || [])
    .map((rect) => ({
      bottom: Math.min(rect.bottom, surfaceRect.bottom),
      left: Math.max(rect.left, surfaceRect.left),
      right: Math.min(rect.right, surfaceRect.right),
      top: Math.max(rect.top, surfaceRect.top),
    }))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
}

function normalizeSelectionRects(rects, surfaceRect) {
  return rects
    .map((rect) => {
      const width = clamp((rect.right - rect.left) / surfaceRect.width, 0.01, 1);
      const height = clamp((rect.bottom - rect.top) / surfaceRect.height, 0.01, 1);
      return {
        height,
        width,
        x: clamp((rect.left - surfaceRect.left) / surfaceRect.width, 0, 1 - width),
        y: clamp((rect.top - surfaceRect.top) / surfaceRect.height, 0, 1 - height),
      };
    })
    .slice(0, MAX_SELECTION_RECTS);
}

function selectionPageNode(selection, host) {
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const startElement = elementFromSelectionNode(range.startContainer);
  const endElement = elementFromSelectionNode(range.endContainer);
  return startElement?.closest?.('[data-reading-pdf-page]')
    || endElement?.closest?.('[data-reading-pdf-page]')
    || host?.querySelector?.('[data-reading-pdf-page]');
}

function countSelectionLines(rects, quote) {
  if (rects.length > 1) {
    const lineTops = [];
    rects.forEach((rect) => {
      if (!lineTops.some((top) => Math.abs(top - rect.top) < Math.max(3, rect.bottom - rect.top) * 0.5)) {
        lineTops.push(rect.top);
      }
    });
    return Math.max(1, lineTops.length);
  }
  return Math.max(1, Math.ceil(String(quote || '').replace(/\s+/g, ' ').trim().length / 84));
}

export function capturePdfSelection(host, { mode = 'word' } = {}) {
  const selection = window.getSelection?.();
  const quote = String(selection?.toString() || '').replace(/\s+/g, ' ').trim();
  if (!selection || !quote || quote.length < 2) {
    return null;
  }

  const pageNode = selectionPageNode(selection, host);
  const surface = pageNode?.querySelector?.('.reading-pdf-page-surface') || pageNode;
  const surfaceRect = surface?.getBoundingClientRect?.();
  const page = Number(pageNode?.dataset?.readingPdfPage || '');
  const rects = clippedSelectionRects(selection, surfaceRect);
  if (!pageNode || !rects.length || !surfaceRect?.width || !surfaceRect?.height) {
    return {
      lineCount: countSelectionLines([], quote),
      mode,
      page: Number.isFinite(page) && page > 0 ? page : null,
      quote: quote.slice(0, 900),
      sourceBounds: null,
    };
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const width = clamp((right - left) / surfaceRect.width, 0.01, 1);
  const height = clamp((bottom - top) / surfaceRect.height, 0.01, 1);

  return {
    lineCount: countSelectionLines(rects, quote),
    mode,
    page: Number.isFinite(page) && page > 0 ? page : null,
    quote: quote.slice(0, 900),
    sourceBounds: {
      height,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      rects: normalizeSelectionRects(rects, surfaceRect),
      unit: 'page-ratio',
      width,
      x: clamp((left - surfaceRect.left) / surfaceRect.width, 0, 1 - width),
      y: clamp((top - surfaceRect.top) / surfaceRect.height, 0, 1 - height),
    },
  };
}

export function createPdfSmartSelectionController({ host, onSelection }) {
  if (!host) return () => {};

  let activeDrag = null;
  let selectionFrame = 0;

  function publishSelection(mode) {
    const selection = capturePdfSelection(host, { mode });
    if (selection) {
      onSelection?.(selection);
    }
  }

  function updateSmartSelection(clientX, clientY) {
    if (!activeDrag || activeDrag.raw) return;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    let focusWord = wordFromPoint(activeDrag.model, clientX, clientY);
    if (!focusWord) return;
    if (
      activeDrag.anchorBlockWords?.length &&
      activeDrag.anchorBlockBounds &&
      !sameSelectionBlock(focusWord, activeDrag.anchorWord)
    ) {
      if (clientX > activeDrag.anchorBlockBounds.right + 24) {
        focusWord = activeDrag.anchorBlockWords.at(-1);
      } else if (clientX < activeDrag.anchorBlockBounds.left - 24) {
        focusWord = activeDrag.anchorBlockWords[0];
      }
    }

    const range = resolveSmartWordRange({
      anchorIndex: activeDrag.anchorWord.globalIndex,
      focusIndex: focusWord.globalIndex,
      words: activeDrag.model.words,
    });
    if (!range) return;
    const startWord = activeDrag.model.words[range.startPosition];
    const endWord = activeDrag.model.words[range.endPosition];
    setNativeWordSelection(startWord, endWord);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.pointerType === 'touch') {
      return;
    }

    const textLayer = event.target?.closest?.('.reading-pdf-text-layer');
    const pageNode = event.target?.closest?.('[data-reading-pdf-page]');
    if (!textLayer || !pageNode || !host.contains(pageNode)) {
      return;
    }

    if (event.shiftKey) {
      activeDrag = { raw: true };
      return;
    }

    const model = buildPageSelectionModel(pageNode);
    const anchorWord = wordFromPoint(model, event.clientX, event.clientY);
    if (!anchorWord) {
      return;
    }

    event.preventDefault();
    const anchorBlockWords = selectionBlockWords(model, anchorWord);
    activeDrag = {
      anchorBlockBounds: selectionBlockBounds(anchorBlockWords),
      anchorBlockWords,
      anchorWord,
      model,
      raw: false,
    };
    setNativeWordSelection(anchorWord, anchorWord);
  }

  function onPointerMove(event) {
    if (!activeDrag || activeDrag.raw) {
      return;
    }

    event.preventDefault();
    activeDrag.clientX = event.clientX;
    activeDrag.clientY = event.clientY;
    if (!selectionFrame) {
      selectionFrame = window.requestAnimationFrame(() => {
        selectionFrame = 0;
        updateSmartSelection(activeDrag?.clientX, activeDrag?.clientY);
      });
    }
  }

  function onPointerUp(event) {
    if (!activeDrag) {
      return;
    }

    event.preventDefault();
    const mode = activeDrag.raw ? 'raw-shift' : 'word';
    activeDrag.clientX = event.clientX;
    activeDrag.clientY = event.clientY;
    window.requestAnimationFrame(() => {
      if (!activeDrag) return;
      if (!activeDrag.raw) {
        updateSmartSelection(activeDrag.clientX, activeDrag.clientY);
      }
      publishSelection(mode);
      activeDrag = null;
    });
  }

  host.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    if (selectionFrame) {
      window.cancelAnimationFrame(selectionFrame);
    }
  };
}
