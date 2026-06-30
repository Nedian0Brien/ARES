import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { createReadingService } from '../lib/reading-service.mjs';
import { createStore } from '../lib/store.mjs';

function createStubRuntime() {
  return {
    async checkAvailability() {
      return false;
    },
    async runJsonTask() {
      throw new Error('runtime unavailable');
    },
    parseJsonFromMessages() {
      return {};
    },
  };
}

function createChatRuntime({
  answer = 'Adaptive skipping reduces reranker latency while preserving answer quality.',
  citations = [{ label: 'Abstract', page: 1, quote: 'Adaptive skipping reduces reranker latency.', sectionId: 'abstract' }],
} = {}) {
  const calls = [];
  return {
    calls,
    async checkAvailability() {
      return true;
    },
    async runJsonTask(input) {
      calls.push(input);
      return [{ role: 'assistant', content: JSON.stringify({ answer, citations }) }];
    },
    parseJsonFromMessages() {
      return { answer, citations };
    },
  };
}

function createSummaryRuntime({
  fullSummary = '## Summary\n\nAdaptive skipping reduces reranker latency while preserving answer quality.',
  keyPoints = ['Confidence-aware gating reduces reranker cost.', 'Quality remains nearly unchanged.'],
  limit = 'Scanned PDFs need extracted text before analysis.',
  method = 'The method gates expensive reranker calls with uncertainty.',
  result = 'The evaluation reports lower latency with similar quality.',
  sectionSummaries = [
    { label: 'Abstract', page: 1, sectionId: 'abstract', summary: 'Adaptive skipping reduces reranker latency.' },
  ],
  tldr = 'Adaptive skipping reduces reranker latency while preserving answer quality.',
} = {}) {
  const payload = { fullSummary, keyPoints, limit, method, result, sectionSummaries, tldr };
  return {
    async checkAvailability() {
      return true;
    },
    async runJsonTask() {
      return [{ role: 'assistant', content: JSON.stringify(payload) }];
    },
    parseJsonFromMessages() {
      return payload;
    },
  };
}

function createPdfParserStub({ text, pages = null, total = 1 } = {}) {
  const parsedPages = pages || [{ num: 1, text }];
  const parsedText = text || parsedPages.map((page) => page.text).join('\n\n');
  return {
    async destroy() {},
    async getImage() {
      return { pages: [], total };
    },
    async getInfo() {
      return { info: {}, pages: [], total };
    },
    async getTable() {
      return { pages: [], total };
    },
    async getText() {
      return {
        pages: parsedPages,
        text: parsedText,
        total,
      };
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

async function waitFor(assertion, { attempts = 50, delayMs = 20 } = {}) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function buildDemoPaper({ pdfUrl = 'https://example.org/papers/demo.pdf' } = {}) {
  return {
    abstract:
      'Adaptive skipping reduces reranker latency while preserving answer quality by routing expensive scoring only when uncertainty is high.',
    authors: ['Demo Author', 'Second Author'],
    citedByCount: 12,
    keyPoints: [
      'Confidence-aware gating reduces reranker cost.',
      'The method keeps quality nearly flat on evaluation sets.',
      'Calibration quality determines the failure mode on hard queries.',
    ],
    keywords: ['rag', 'reranker', 'adaptive skipping'],
    matchedKeywords: ['adaptive skipping', 'reranker'],
    openAccess: true,
    paperId: 'demo-paper',
    paperUrl: 'https://example.org/papers/demo',
    pdfUrl,
    relevance: 96,
    sourceName: 'ARES seed library',
    sourceProvider: 'seed',
    summary: 'Adaptive skipping reduces reranker latency while keeping answer quality nearly unchanged.',
    title: 'Adaptive Skipping for Efficient Reranking',
    venue: 'ACL 2026',
    year: 2026,
  };
}

async function createHarness({
  agentRuntime = createStubRuntime(),
  enableDemoPdf = true,
  fetchImpl = globalThis.fetch,
  ocrEngine = null,
  pdfParseFactory = null,
  readingSessions = [],
} = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ares-reading-service-'));
  const seedFile = path.join(tempDir, 'data', 'store.seed.json');
  const runtimeFile = path.join(tempDir, 'data', 'runtime', 'store.json');
  await fs.mkdir(path.dirname(seedFile), { recursive: true });
  await fs.writeFile(
    seedFile,
    JSON.stringify(
      {
        agentRuns: [],
        experimentRuns: [],
        insightNotes: [],
        library: {
          demo: [],
        },
        projects: [
          {
            id: 'demo',
            name: 'Demo',
            color: '#5e6ad2',
            focus: 'Demo focus',
            defaultQuery: 'adaptive reranker',
            keywords: ['rag', 'reranker'],
          },
        ],
        readingQueue: {
          demo: [],
        },
        readingSessions,
        reproChecklistItems: [],
        resultComparisons: [],
        writingDrafts: [],
      },
      null,
      2,
    ),
  );

  const store = await createStore({ seedFile, runtimeFile });
  const service = createReadingService({
    agentRuntime,
    enableDemoPdf,
    fetchImpl,
    ocrEngine,
    ...(pdfParseFactory ? { pdfParseFactory } : {}),
    rootDir: tempDir,
    store,
  });

  return {
    rootDir: tempDir,
    service,
    store,
  };
}

test('reading service parses cached PDF without creating user notes', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const payload = await service.parseSession(session.id);

  assert.equal(payload.session.parseStatus, 'done');
  assert.ok(payload.session.pageCount >= 1);
  assert.ok(payload.session.pdfCachePath);
  assert.ok(payload.session.parsedArtifactPath);
  assert.ok(payload.session.sections.length >= 3);
  assert.ok(payload.session.highlights.length >= 2);
  assert.deepEqual(payload.session.notes, []);
  assert.ok(payload.session.highlights.every((highlight) => highlight.selectionMethod));
  assert.ok(payload.session.highlights.every((highlight) => highlight.confidence > 0));
  assert.ok(payload.session.assets.length >= 1);
  assert.equal(payload.session.evidenceCoverage.chunkCount, payload.artifact.chunks.length);
  assert.equal(payload.session.evidenceCoverage.assetCount, payload.session.assets.length);
  assert.ok(payload.session.evidenceCoverage.sourceBoundedAssetCount >= 1);
  assert.match(payload.session.evidenceCoverage.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  await fs.access(path.join(rootDir, payload.session.pdfCachePath));
  await fs.access(path.join(rootDir, payload.session.parsedArtifactPath));
});

test('reading service keeps demo PDF generation behind an explicit flag', async (t) => {
  const { service, store } = await createHarness({ enableDemoPdf: false });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });

  await assert.rejects(
    () => service.getSessionPdf(session.id),
    /Demo PDF generation is disabled/,
  );
});

test('reading service demo PDF does not invent academic metadata', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: {
      ...buildDemoPaper(),
      authors: [],
      venue: '',
      year: null,
    },
    projectId: 'demo',
  });

  const pdf = await service.getSessionPdf(session.id);
  const text = pdf.buffer.toString('utf8');
  assert.match(text, /Authors not provided/);
  assert.match(text, /출처 정보 없음/);
  assert.doesNotMatch(text, /Kim, J/);
  assert.doesNotMatch(text, /KAIST/);
  assert.doesNotMatch(text, /ACL 2024/);
  assert.doesNotMatch(text, /arXiv:2406/);
});

test('reading service creates uploaded PDF sessions with cached source files', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const payload = await service.createUploadedSession({
    autoAnalyze: false,
    contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    fileName: 'local-paper.pdf',
    projectId: 'demo',
  });

  assert.equal(payload.paper.sourceProvider, 'upload');
  assert.equal(payload.session.title, 'local-paper');
  assert.equal(payload.session.sourceProvider, 'upload');
  assert.ok(payload.session.pdfCachePath);
  assert.match(payload.session.pdfUrl, /^uploaded:\/\//);

  const pdf = await service.getSessionPdf(payload.session.id);
  assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
  await fs.access(path.join(rootDir, payload.session.pdfCachePath));
  assert.ok(store.getLibrary('demo').some((paper) => paper.paperId === payload.paper.paperId));
});

test('reading service returns provisional PDF metadata, then replaces it with AI summary metadata', async (t) => {
  let summaryPrompt = '';
  const pdfText = [
    'Draft Header From PDF Text',
    'Temporary Author, Second Temporary',
    'Some Institute',
    '',
    'Abstract',
    'Self-refine RAG improves evidence selection for AI paper reading by checking whether retrieved passages support the generated answer.',
    '',
    '1 Introduction',
    'AI research assistants often preserve a weak answer when retrieval evidence is noisy.',
    '',
    '2 Method',
    'The method asks a verifier to compare answer claims against paper passages before finalizing the summary.',
    '',
    '3 Results',
    'The verifier improves answer faithfulness on scientific question answering benchmarks.',
    '',
    '4 Conclusion',
    'Self-refine RAG reduces unsupported claims, but it still depends on the quality of extracted PDF text.',
  ].join('\n');
  const { service, store } = await createHarness({
    agentRuntime: {
      async checkAvailability() {
        return true;
      },
      parseJsonFromMessages() {
        return {
          authors: ['Jiwon Kim', 'Alice Chen'],
          fullSummary:
            '📄 **Self-Refine RAG for Reliable Scientific Reading**\n\n1. 논문 내용 요약 및 핵심 정리\n- 이 논문은 검색 증거와 생성 답변을 다시 대조해 과학 논문 읽기의 신뢰도를 높이는 방법을 설명한다.',
          keyPoints: ['증거 검증 단계가 답변 충실도를 높인다.', 'PDF 텍스트 품질이 전체 요약 품질을 좌우한다.'],
          limit: 'PDF 텍스트 추출 품질이 낮으면 검증 단계도 흔들릴 수 있다.',
          method: '검색된 passage와 생성 답변의 claim을 verifier가 비교한다.',
          paperTitleEnglish: 'Self-Refine RAG for Reliable Scientific Reading',
          result: '과학 QA 벤치마크에서 unsupported claim을 줄인다.',
          sectionSummaries: [],
          tldr: '검색 증거를 다시 검증해 AI 논문 리딩의 답변 충실도를 높이는 방법이다.',
        };
      },
      async runJsonTask({ prompt }) {
        summaryPrompt = prompt;
        return { messages: [{ role: 'assistant', content: '{}' }] };
      },
    },
    ocrEngine: null,
    pdfParseFactory: () => createPdfParserStub({ text: pdfText }),
  });
  t.after(async () => {
    await store.close?.();
  });

  const payload = await service.createUploadedSession({
    contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    fileName: 'local-upload.pdf',
    projectId: 'demo',
  });

  assert.equal(payload.session.title, 'Draft Header From PDF Text');
  assert.deepEqual(payload.session.authors, ['Temporary Author', 'Second Temporary']);
  assert.equal(payload.session.metadataStatus, 'provisional');
  assert.equal(payload.session.parseStatus, 'running');
  assert.equal(payload.session.summaryStatus, 'idle');

  await waitFor(() => {
    const session = store.getReadingSession(payload.session.id);
    assert.equal(session.title, 'Self-Refine RAG for Reliable Scientific Reading');
    assert.deepEqual(session.authors, ['Jiwon Kim', 'Alice Chen']);
    assert.equal(session.metadataStatus, 'ai');
    assert.equal(session.parseStatus, 'done');
    assert.equal(session.summaryStatus, 'done');
    assert.match(session.summaryCards.fullSummary, /논문 내용 요약 및 핵심 정리/);

    const savedPaper = store.getLibrary('demo').find((paper) => paper.paperId === payload.paper.paperId);
    assert.equal(savedPaper.title, 'Self-Refine RAG for Reliable Scientific Reading');
    assert.deepEqual(savedPaper.authors, ['Jiwon Kim', 'Alice Chen']);
  });
  assert.match(summaryPrompt, /당신은 AI 분야 연구논문 요약 정리기입니다/);
  assert.match(summaryPrompt, /paperTitleEnglish/);
  assert.match(summaryPrompt, /authors/);
});

test('reading chat waits for uploaded PDF analysis instead of blocking immediately', async (t) => {
  const parseGate = createDeferred();
  let parserCalls = 0;
  const metadataText = [
    'Immediate Upload Title',
    'First Author, Second Author',
    '',
    'Abstract',
    'The upload starts analysis immediately so chat can join the parsing work.',
  ].join('\n');
  const parsedText = [
    'Abstract',
    'Immediate chat over an uploaded PDF waits for parsing and then answers from the paper.',
    '',
    '1 Introduction',
    'The reader should not block questions while extraction is already running.',
    '',
    '2 Method',
    'The backend joins the active analysis task before generating the chat answer.',
  ].join('\n');
  const runtime = {
    async checkAvailability() {
      return true;
    },
    parseJsonFromMessages(messages) {
      return JSON.parse(messages[0].content);
    },
    async runJsonTask({ prompt }) {
      if (/paperTitleEnglish/.test(prompt)) {
        return [
          {
            role: 'assistant',
            content: JSON.stringify({
              fullSummary: '## Summary\n\nImmediate chat remains available while uploaded PDFs are parsed.',
              keyPoints: ['질문은 파싱 작업에 합류한다.', '분석 완료 뒤 답변을 생성한다.'],
              limit: 'PDF 추출 시간이 답변 대기 시간에 포함될 수 있다.',
              method: '활성 분석 작업을 공유한다.',
              result: '업로드 직후에도 질문 입력을 막지 않는다.',
              sectionSummaries: [],
              tldr: '업로드 직후 질문해도 분석 준비 후 답변한다.',
            }),
          },
        ];
      }
      return [
        {
          role: 'assistant',
          content: JSON.stringify({
            answer: 'The backend joins the active analysis task before answering.',
            citations: [{ label: 'Method', page: 1, quote: 'joins the active analysis task', sectionId: '2-method' }],
          }),
        },
      ];
    },
  };
  const { service, store } = await createHarness({
    agentRuntime: runtime,
    ocrEngine: null,
    pdfParseFactory: () => {
      parserCalls += 1;
      if (parserCalls === 1) {
        return createPdfParserStub({ text: metadataText });
      }
      return {
        async destroy() {},
        async getImage() {
          return { pages: [], total: 1 };
        },
        async getInfo() {
          return { info: {}, pages: [], total: 1 };
        },
        async getTable() {
          return { pages: [], total: 1 };
        },
        async getText() {
          await parseGate.promise;
          return {
            pages: [{ num: 1, text: parsedText }],
            text: parsedText,
            total: 1,
          };
        },
      };
    },
  });
  t.after(async () => {
    parseGate.resolve();
    await store.close?.();
  });

  const payload = await service.createUploadedSession({
    contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    fileName: 'instant-chat.pdf',
    projectId: 'demo',
  });
  assert.equal(payload.session.parseStatus, 'running');

  const chatPromise = service
    .chat(payload.session.id, {
      message: 'Can I ask immediately after upload?',
    })
    .catch((error) => ({ error }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  parseGate.resolve();

  const chat = await chatPromise;
  assert.ifError(chat.error);
  assert.equal(chat.session.parseStatus, 'done');
  assert.equal(chat.messages[1].role, 'assistant');
  assert.match(chat.messages[1].text, /active analysis task/i);
  assert.equal(parserCalls, 2);
});

test('reading service mirrors sessions into reading packets for the asset graph', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    display: { labMeta: "Kim · ACL '24", labOrder: 1, labTitle: 'Adaptive Skipping' },
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  let graph = store.getProjectGraph('demo');
  assert.equal(graph.readingPackets.length, 1);
  assert.equal(graph.readingPackets[0].id, `packet-${session.id}`);
  assert.equal(graph.readingPackets[0].paperId, 'demo-paper');
  assert.equal(graph.readingPackets[0].readingSessionId, session.id);
  assert.deepEqual(session.display, { labMeta: "Kim · ACL '24", labOrder: 1, labTitle: 'Adaptive Skipping' });

  await service.parseSession(session.id);
  graph = store.getProjectGraph('demo');
  const packet = graph.readingPackets[0];
  assert.equal(packet.status, 'done');
  assert.ok(packet.sections.length >= 3);
  assert.deepEqual(packet.notes, []);
  assert.ok(packet.methodParameters.length >= 1);
});

test('reading service parses metadata-only papers from abstract and key points', async (t) => {
  const { service, store } = await createHarness({ agentRuntime: createChatRuntime() });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const payload = await service.parseSession(session.id);

  assert.equal(payload.session.parseStatus, 'done');
  assert.equal(payload.session.sourceProvider, 'metadata');
  assert.equal(payload.session.pageCount, 1);
  assert.ok(payload.session.sections.length >= 1);
  assert.deepEqual(payload.session.notes, []);
  assert.ok(payload.session.evidenceCoverage.chunkCount >= 1);

  const answer = await service.chat(session.id, {
    message: 'What does the metadata say about reranker cost?',
  });
  assert.equal(answer.messages[1].role, 'assistant');
  assert.ok(answer.messages[1].citations.length >= 1);
});

test('reading service imports external OCR text as a parse recovery path', async (t) => {
  const { rootDir, service, store } = await createHarness({ agentRuntime: createChatRuntime() });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });

  const importedText = [
    'Abstract',
    'External OCR text recovers a scanned paper for Reader search and chat.',
    'Method',
    'The system accepts extracted text without claiming built-in OCR.',
    'Results',
    'Recovered text produces sections, chunks, evidence, and summary cards.',
  ].join('\n');
  const recovered = await service.importTextSession(session.id, {
    generatedAt: '2026-06-12T08:30:00.000Z',
    sourceLabel: 'External OCR import',
    text: importedText,
    tool: 'Tesseract 5',
  });

  assert.equal(recovered.session.parseStatus, 'done');
  assert.equal(recovered.session.parseError, '');
  assert.equal(recovered.session.summaryStatus, 'done');
  assert.equal(recovered.session.summaryGeneratedBy, 'external-ocr');
  assert.equal(recovered.session.summaryRuntimeUsed, true);
  assert.equal(recovered.session.sourceProvider, 'external-ocr');
  assert.equal(recovered.session.ocrProvenance.generatedAt, '2026-06-12T08:30:00.000Z');
  assert.match(recovered.session.ocrProvenance.importedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(recovered.session.ocrProvenance.sourceLabel, 'External OCR import');
  assert.equal(recovered.session.ocrProvenance.textLength, importedText.length);
  assert.equal(recovered.session.ocrProvenance.tool, 'Tesseract 5');
  assert.ok(recovered.session.parsedArtifactPath);
  assert.ok(recovered.session.sections.some((section) => section.label === 'Method'));
  assert.deepEqual(recovered.session.notes, []);
  assert.match(recovered.session.summaryCards.tldr, /External OCR text/i);
  assert.equal(recovered.artifact.importSource, 'external-ocr');
  assert.equal(recovered.artifact.importProvenance.tool, 'Tesseract 5');
  assert.equal(recovered.artifact.pages[0].sourceLabel, 'External OCR import');

  await fs.access(path.join(rootDir, recovered.session.parsedArtifactPath));

  const answer = await service.chat(recovered.session.id, {
    message: 'What does the recovered text produce?',
  });
  assert.equal(answer.session.chatMessages.at(-1).role, 'assistant');
  assert.ok(answer.session.chatMessages.at(-1).citations.length >= 1);
});

test('reading section detection ignores title-case body lines between real headings', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Wrapped paper text import',
    text: [
      'Abstract',
      'Adaptive Routing Avoids Extra Reranking',
      'This line is title-cased by PDF extraction but belongs to the abstract body.',
      '1 Introduction',
      'Short Title Case Body Line',
      'The introduction discusses the motivation for confidence-aware routing.',
      'Method',
      'The method keeps expensive scoring behind a calibrated uncertainty gate.',
      'Results',
      'The evaluation reports stable quality and lower latency.',
    ].join('\n'),
  });

  const labels = parsed.session.sections.map((section) => section.label);

  assert.deepEqual(labels, ['Abstract', '1 Introduction', 'Method', 'Results']);
  assert.match(parsed.session.sections[0].summary, /Adaptive Routing Avoids Extra Reranking/);
  assert.match(parsed.session.sections[1].summary, /Short Title Case Body Line/);
});

test('reading service runs built-in OCR when a PDF has no text layer', async (t) => {
  const generatedAt = '2026-06-12T10:10:00.000Z';
  const ocrEngine = {
    provider: 'test-ocr',
    async recognizePdf({ pageCount, pdfBuffer }) {
      assert.ok(pdfBuffer.length > 0);
      assert.equal(pageCount, 2);
      return {
        generatedAt,
        pages: [
          { num: 1, text: 'Scanned OCR method reduces reranker latency with confidence routing.' },
          { num: 2, text: 'Results show the scanned paper keeps quality stable while cutting cost.' },
        ],
        tool: 'Fake OCR 1.0',
      };
    },
  };
  const pdfParseFactory = () => ({
    async destroy() {},
    async getImage() {
      return { pages: [], total: 2 };
    },
    async getInfo() {
      return { pages: [], total: 2 };
    },
    async getTable() {
      return { pages: [], total: 2 };
    },
    async getText() {
      return { pages: [], text: '', total: 2 };
    },
  });
  const { service, store } = await createHarness({ agentRuntime: createChatRuntime(), ocrEngine, pdfParseFactory });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);

  assert.equal(parsed.session.parseStatus, 'done');
  assert.equal(parsed.session.sourceProvider, 'built-in-ocr');
  assert.equal(parsed.session.summaryGeneratedBy, 'built-in-ocr');
  assert.equal(parsed.session.ocrProvenance.tool, 'Fake OCR 1.0');
  assert.equal(parsed.session.ocrProvenance.generatedAt, generatedAt);
  assert.equal(parsed.session.ocrProvenance.pageCount, 2);
  assert.equal(parsed.session.ocrProvenance.maxPages, 12);
  assert.equal(parsed.session.ocrProvenance.durationMs >= 0, true);
  assert.equal(parsed.session.evidenceCoverage.ocrPageCount, 2);
  assert.equal(parsed.session.evidenceCoverage.ocrDurationMs >= 0, true);
  assert.equal(parsed.artifact.importSource, 'built-in-ocr');
  assert.equal(parsed.artifact.importProvenance.pageCount, 2);
  assert.equal(parsed.artifact.pages.length, 2);
  assert.deepEqual(parsed.session.notes, []);

  const chat = await service.chat(session.id, {
    message: 'What did the scanned OCR paper say about reranker latency?',
  });
  assert.match(chat.messages.at(-1).text, /reranker latency/i);
  assert.ok(chat.messages.at(-1).citations.length >= 1);
});

test('reading summarize enforces parse prerequisite and persists agent summary cards after parse', async (t) => {
  const { service, store } = await createHarness({ agentRuntime: createSummaryRuntime() });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });

  await assert.rejects(() => service.summarizeSession(session.id), /Analyze the paper/i);

  await service.parseSession(session.id);
  const payload = await service.summarizeSession(session.id);

  assert.equal(payload.session.summaryStatus, 'done');
  assert.ok(payload.session.summaryCards.tldr);
  assert.ok(payload.session.summaryCards.method);
  assert.ok(payload.session.summaryCards.result);
  assert.ok(payload.session.summaryCards.limit);
  assert.ok(payload.session.summaryCards.keyPoints.length >= 2);
});

test('reading analysis runs parse, summary, and asset extraction as one action', async (t) => {
  const { service, store } = await createHarness({ agentRuntime: createSummaryRuntime() });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });

  const payload = await service.analyzeSession(session.id);

  assert.equal(payload.session.parseStatus, 'done');
  assert.equal(payload.session.summaryStatus, 'done');
  assert.ok(payload.session.parsedArtifactPath);
  assert.ok(payload.session.summaryCards.tldr);
  assert.ok(payload.session.assets.length >= 1);
});

test('reading summary and chat do not save generated prose when agent runtime is unavailable', async (t) => {
  const { service, store } = await createHarness({
    agentRuntime: {
      async checkAvailability() {
        return false;
      },
    },
  });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const summary = await service.summarizeSession(session.id);
  assert.equal(summary.session.summaryStatus, 'error');
  assert.equal(summary.session.summaryGeneratedBy, '');
  assert.equal(summary.session.summaryRuntimeUsed, false);
  assert.match(summary.session.summaryError, /agent runtime unavailable/i);
  assert.equal(summary.session.summaryCards, null);
  assert.equal(summary.session.summary, null);

  await assert.rejects(
    () => service.chat(session.id, { message: 'What is the main method?' }),
    /AI chat generation failed: agent runtime unavailable/i,
  );
  const unchanged = await service.getSession(session.id);
  assert.equal(unchanged.chatMessages.length, 0);
});

test('reading summary rejects malformed agent output instead of filling fallback fields', async (t) => {
  const { service, store } = await createHarness({
    agentRuntime: createChatRuntime({ answer: 'This is not a summary schema.', citations: [] }),
  });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const summary = await service.summarizeSession(session.id);

  assert.equal(summary.session.summaryStatus, 'error');
  assert.equal(summary.session.summaryGeneratedBy, '');
  assert.equal(summary.session.summaryRuntimeUsed, true);
  assert.match(summary.session.summaryError, /AI summary generation failed/i);
  assert.equal(summary.session.summaryCards, null);
  assert.equal(summary.session.summary, null);
});

test('reading chat stores turns with citations after parse', async (t) => {
  const runtime = createChatRuntime();
  const { service, store } = await createHarness({ agentRuntime: runtime });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);
  const payload = await service.chat(session.id, {
    message: 'What is the main method?',
  });

  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].role, 'user');
  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].generatedBy, 'agent-runtime');
  assert.ok(payload.messages[1].citations.length >= 1);
  assert.equal(payload.session.chatMessages.length, 2);
  assert.equal(payload.session.evidenceCoverage.citedChatCount, 1);
});

test('reading chat sends parsed paper context and the user question to the agent by default', async (t) => {
  const runtime = createChatRuntime({
    answer: '이 논문은 reranker 호출을 줄이기 위해 불확실성 기반 게이트를 사용합니다.',
  });
  const { service, store } = await createHarness({ agentRuntime: runtime });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);
  const payload = await service.chat(session.id, {
    message: '이 논문에 대해 알려줘',
  });

  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].generatedBy, 'agent-runtime');
  assert.match(payload.messages[1].text, /reranker 호출을 줄이기/);
  assert.equal(runtime.calls.length, 1);
  assert.match(runtime.calls[0].prompt, /PDF location:/);
  assert.match(runtime.calls[0].prompt, /- pdfUrl: https:\/\/example\.org\/papers\/demo\.pdf/);
  assert.match(runtime.calls[0].prompt, /- cachedPdfPath: data\/runtime\/reading\//);
  assert.match(runtime.calls[0].prompt, /Paper context:/);
  assert.match(runtime.calls[0].prompt, /TLDR: Adaptive skipping reduces reranker latency/);
  assert.match(runtime.calls[0].prompt, /Section summaries:/);
  assert.match(runtime.calls[0].prompt, /Abstract \(p\.1\): .*Adaptive skipping reduces reranker latency/);
  assert.match(runtime.calls[0].prompt, /Relevant paper chunks:/);
  assert.match(runtime.calls[0].prompt, /\[p\.1\] .*Adaptive skipping reduces reranker latency/);
  assert.match(runtime.calls[0].prompt, /User question:\n이 논문에 대해 알려줘/);
  assert.doesNotMatch(payload.messages[1].text, /근거를 충분히 찾지 못했습니다/);
});

test('reading chat does not block runtime answers with retrieval gates', async (t) => {
  const runtime = createChatRuntime({
    answer: 'The paper evaluates Martian ocean chemistry.',
    citations: [],
  });
  const { service, store } = await createHarness({ agentRuntime: runtime });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const payload = await service.chat(session.id, {
    message: 'What does the paper conclude about Martian ocean chemistry?',
  });

  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].generatedBy, 'agent-runtime');
  assert.equal(payload.messages[1].citations.length, 0);
  assert.equal('retrieval' in payload.messages[1], false);
  assert.match(payload.messages[1].text, /Martian ocean chemistry/);
});

test('reading chat includes selected text in the agent prompt', async (t) => {
  const runtime = createChatRuntime({
    answer: '선택한 문장은 불확실성이 높을 때만 비싼 scoring을 호출한다는 뜻입니다.',
    citations: [{ label: 'Selected PDF text', page: 2, quote: 'calibrated uncertainty gate', sectionId: 'selection' }],
  });
  const { service, store } = await createHarness({ agentRuntime: runtime });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const payload = await service.chat(session.id, {
    message: '이 선택한 문장 설명해줘',
    selection: {
      page: 2,
      quote: 'The method keeps expensive scoring behind a calibrated uncertainty gate.',
    },
  });

  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].generatedBy, 'agent-runtime');
  assert.equal(payload.messages[1].citations[0].sectionId, 'selection');
  assert.match(runtime.calls[0].prompt, /Primary selected PDF text/);
  assert.match(runtime.calls[0].prompt, /calibrated uncertainty gate/);
});

test('reading note CRUD persists inline note edits', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);

  const created = await service.createNote(session.id, {
    body: 'Need to validate calibration data split.',
    kind: 'note',
    page: 2,
    quote: 'Calibration quality determines the failure mode on hard queries.',
    sourceBounds: {
      height: 0.08,
      page: 2,
      rects: [
        { height: 0.03, width: 0.42, x: 0.18, y: 0.34 },
        { height: 0.03, width: 0.31, x: 0.18, y: 0.39 },
      ],
      unit: 'page-ratio',
      width: 0.42,
      x: 0.18,
      y: 0.34,
    },
  });
  assert.ok(created.note.id);
  assert.ok(created.note.evidenceLinkId);
  assert.deepEqual(created.note.sourceBounds, {
    height: 0.08,
    page: 2,
    rects: [
      { height: 0.03, width: 0.42, x: 0.18, y: 0.34 },
      { height: 0.03, width: 0.31, x: 0.18, y: 0.39 },
    ],
    unit: 'page-ratio',
    width: 0.42,
    x: 0.18,
    y: 0.34,
  });
  let graph = store.getProjectGraph('demo');
  assert.ok(graph.evidenceLinks.some((entry) => entry.id === created.note.evidenceLinkId));
  assert.ok(graph.readingPackets[0].evidenceLinkIds.includes(created.note.evidenceLinkId));
  assert.deepEqual(
    graph.evidenceLinks.find((entry) => entry.id === created.note.evidenceLinkId)?.locator?.sourceBounds,
    created.note.sourceBounds,
  );

  const updated = await service.updateNote(session.id, created.note.id, {
    body: 'Need to validate calibration data split before the next run.',
  });
  assert.match(updated.note.body, /before the next run/);
  assert.deepEqual(updated.note.sourceBounds, created.note.sourceBounds);
  graph = store.getProjectGraph('demo');
  assert.match(
    graph.evidenceLinks.find((entry) => entry.id === created.note.evidenceLinkId)?.quote,
    /Calibration quality/,
  );

  const removed = await service.deleteNote(session.id, created.note.id);
  assert.equal(removed.ok, true);
  assert.ok(!removed.session.notes.some((note) => note.id === created.note.id));
  graph = store.getProjectGraph('demo');
  assert.ok(!graph.evidenceLinks.some((entry) => entry.id === created.note.evidenceLinkId));
  assert.ok(!graph.readingPackets[0].evidenceLinkIds.includes(created.note.evidenceLinkId));
});

test('reading asset extraction can be rerun from cached parsed artifact', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  await service.parseSession(session.id);
  const extracted = await service.extractAssets(session.id);

  assert.ok(extracted.assets.length >= 1);
  assert.equal(extracted.session.assets.length, extracted.assets.length);
});

test('reading assets retain source bounds for PDF detail overlays', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Asset source bounds import',
    text: [
      'Abstract',
      'This paper includes explicit visual and table assets.',
      'Results',
      'Figure 1. Adaptive skip policy overview.',
      'The policy estimates confidence before reranking.',
      'Table 1. Efficiency comparison.',
      'System      Latency(ms)      Quality',
      'Baseline    120              84.1',
      'Adaptive     78              83.8',
    ].join('\n'),
  });

  const figure = parsed.session.assets.find((asset) => asset.kind === 'figure');
  const table = parsed.session.assets.find((asset) => asset.kind === 'table');

  for (const asset of [figure, table]) {
    assert.ok(asset, 'expected demo asset');
    assert.equal(asset.sourceBounds.unit, 'page-ratio');
    assert.equal(asset.sourceBounds.page, asset.page);
    assert.ok(asset.quality);
    assert.equal(asset.quality.status, 'source-backed');
    assert.ok(asset.quality.score >= 0.7);
    assert.ok(asset.quality.checks.includes('source-bounds'));
    assert.ok(asset.sourceBounds.x >= 0 && asset.sourceBounds.x <= 1);
    assert.ok(asset.sourceBounds.y >= 0 && asset.sourceBounds.y <= 1);
    assert.ok(asset.sourceBounds.width > 0 && asset.sourceBounds.width <= 1);
    assert.ok(asset.sourceBounds.height > 0 && asset.sourceBounds.height <= 1);
    assert.match(asset.sourceText, asset.kind === 'figure' ? /Figure 1/ : /Table 1/);
  }
});

test('reading figure assets store rendered PDF crop thumbnails', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);
  const figure = parsed.session.assets.find((asset) => asset.kind === 'figure');

  assert.ok(figure);
  assert.match(figure.thumbPath, /\.png$/);

  const thumbBuffer = await fs.readFile(path.join(rootDir, figure.thumbPath));
  assert.equal(thumbBuffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const file = await service.getSessionAssetFile(session.id, { assetId: figure.id, kind: 'thumb' });
  assert.equal(file.contentType, 'image/png');
  assert.equal(file.buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('reading table extraction handles captionless pipe tables', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Captionless table import',
    text: [
      'Abstract',
      'This paper reports a compact captionless result table.',
      'Results',
      'Metric | Baseline | Adaptive | Delta',
      'Latency(ms) | 120 | 78 | -42',
      'Quality | 84.1 | 83.8 | -0.3',
      'Cost($) | 1.00 | 0.62 | -0.38',
    ].join('\n'),
  });

  const table = parsed.session.assets.find((asset) => asset.kind === 'table');
  assert.ok(table);
  assert.equal(table.caption, 'Table 1');
  assert.deepEqual(table.rows[0], ['Metric', 'Baseline', 'Adaptive', 'Delta']);
  assert.equal(table.rows.length, 4);
  assert.match(table.sourceText, /Metric Baseline Adaptive Delta/);
});

test('reading assets detect colon figure captions without turning math prose into tables', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Diffusion tutorial import',
    text: [
      '1 Fundamentals of Diffusion',
      'xt+1 := xt + eta_t, eta_t ~ N(0, sigma2). (1)',
      'Reverse samplers will be formally defined in Section 1.2 below.\tus how to sample from pt-1 assuming we can already sample from pt.',
      'p(xt-1 | xt = z) approx N(xt-1; mu, sigma2). (3)',
      'Figure 1: Probability distributions defined by diffusion forward process on one-dimensional target distribution p0.',
    ].join('\n'),
  });

  const figures = parsed.session.assets.filter((asset) => asset.kind === 'figure');
  const tables = parsed.session.assets.filter((asset) => asset.kind === 'table');

  assert.equal(figures.length, 1);
  assert.equal(figures[0].number, 1);
  assert.match(figures[0].caption, /Figure 1: Probability distributions/);
  assert.equal(tables.length, 0);
});

test('reading table extraction starts at the caption block instead of chart ticks', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'SAGE page import',
    text: [
      'GRPO w/o KL\tGRPO\tGRPO+Branch',
      '0.00',
      '0.25',
      '0.50',
      'Figure 2. Comparison between GRPO without KL regularization.',
      'Table 2. Frequency analysis of reasoning patterns. We report',
      'the average frequency over 3 seeds of detected reasoning patterns.',
      'Reasoning Pattern Base Model GRPO GRPO + Branch',
      'Constraint Setup 0.458 0.604 0.583',
      'Structural Reasoning 0.291 0.377 0.301',
      'Proof by Contradiction 0.007 0.008 0.033',
    ].join('\n'),
  });

  const table = parsed.session.assets.find((asset) => asset.kind === 'table' && asset.number === 2);
  assert.ok(table);
  assert.deepEqual(table.rows[0], ['Constraint Setup', '0.458', '0.604', '0.583']);
  assert.ok(!table.rows.some((row) => row.includes('GRPO w/o KL')));
});

test('reading table extraction creates separate assets for multiple captions on one page', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Shared page table import',
    text: [
      'Table 3. Algorithm ablations across heterogeneous RLVR variants.',
      'Algorithm\tAIME\tAMC23\tAvg',
      'BNPO\t0.043\t0.390\t0.243',
      'BNPO + Branch\t0.070\t0.435\t0.271',
      '',
      'Table 4. Model ablation with DeepSeek-R1-Distill-Qwen-7B.',
      'Algorithm\tAIME\tAMC23\tAvg',
      'GRPO\t0.250\t0.635\t0.449',
      'GRPO + Branch\t0.260\t0.635\t0.452',
    ].join('\n'),
  });

  const tables = parsed.session.assets.filter((asset) => asset.kind === 'table');

  assert.equal(tables.length, 2);
  assert.deepEqual(tables.map((asset) => asset.number), [3, 4]);
  assert.deepEqual(tables[0].rows[0], ['Algorithm', 'AIME', 'AMC23', 'Avg']);
  assert.deepEqual(tables[1].rows[0], ['Algorithm', 'AIME', 'AMC23', 'Avg']);
  assert.match(tables[1].caption, /Table 4\. Model ablation/);
});

test('reading table extraction accepts caption text without punctuation', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Punctuation-free table caption import',
    text: [
      'Table 1 Statistics of the datasets',
      'Test Sets      Page      Table',
      'Wired          124       418',
      'PubTabNet      568       910',
    ].join('\n'),
  });

  const tables = parsed.session.assets.filter((asset) => asset.kind === 'table');

  assert.equal(tables.length, 1);
  assert.equal(tables[0].caption, 'Table 1. Statistics of the datasets');
  assert.deepEqual(tables[0].rows[0], ['Test Sets', 'Page', 'Table']);
});

test('reading table extraction keeps punctuation-free caption titles that start with verbs', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Verb-title table caption import',
    text: [
      'Table 3 Compare with state-of-the-art methods on PubTabNet dataset.',
      'Methods Acc',
      '(%)',
      'TEDS',
      '(%)',
      'TableMaster[28] 77.90 96.12 - 2144 253',
      'LGPMA[10] 65.74 94.70 96.70 - 177',
      'SLANet[13] 76.31 95.89 97.01 766 9.2',
    ].join('\n'),
  });

  const table = parsed.session.assets.find((asset) => asset.kind === 'table' && asset.number === 3);

  assert.ok(table);
  assert.equal(table.caption, 'Table 3. Compare with state-of-the-art methods on PubTabNet dataset.');
  assert.deepEqual(table.rows[0], ['TableMaster[28]', '77.90', '96.12', '-', '2144', '253']);
});

test('reading table extraction can bind rows immediately before a caption', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper({ pdfUrl: null }),
    projectId: 'demo',
  });
  const parsed = await service.importTextSession(session.id, {
    sourceLabel: 'Pre-caption table rows import',
    text: [
      '# figures 952 289 1,030,671 3,064,951',
      '# tables 282 124 164,356 1,267,464',
      'Table 1: Number of papers, figures, and tables in the manually-labeled datasets.',
    ].join('\n'),
  });

  const tables = parsed.session.assets.filter((asset) => asset.kind === 'table');

  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, [
    ['# figures', '952', '289', '1,030,671', '3,064,951'],
    ['# tables', '282', '124', '164,356', '1,267,464'],
  ]);
  assert.equal(tables[0].sourceBounds.y, 0);
});
