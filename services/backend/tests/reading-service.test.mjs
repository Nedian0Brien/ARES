import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { CHAT_EVIDENCE_POLICY, createReadingService } from '../lib/reading-service.mjs';
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
  requireAgentRuntime = false,
  retrievalScorer = null,
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
    requireAgentRuntime,
    retrievalScorer,
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
  assert.equal(payload.session.evidenceCoverage.retrievalReady, true);
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

test('reading service mirrors sessions into reading packets for the asset graph', async (t) => {
  const { service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  let graph = store.getProjectGraph('demo');
  assert.equal(graph.readingPackets.length, 1);
  assert.equal(graph.readingPackets[0].id, `packet-${session.id}`);
  assert.equal(graph.readingPackets[0].paperId, 'demo-paper');

  await service.parseSession(session.id);
  graph = store.getProjectGraph('demo');
  const packet = graph.readingPackets[0];
  assert.equal(packet.status, 'done');
  assert.ok(packet.sections.length >= 3);
  assert.deepEqual(packet.notes, []);
  assert.ok(packet.methodParameters.length >= 1);
});

test('reading service parses metadata-only papers from abstract and key points', async (t) => {
  const { service, store } = await createHarness();
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
  assert.ok(payload.session.evidenceCoverage.retrievalReady);

  const answer = await service.chat(session.id, {
    message: 'What does the metadata say about reranker cost?',
  });
  assert.equal(answer.messages[1].role, 'assistant');
  assert.ok(answer.messages[1].citations.length >= 1);
});

test('reading service imports external OCR text as a parse recovery path', async (t) => {
  const { rootDir, service, store } = await createHarness();
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
  const { service, store } = await createHarness({ ocrEngine, pdfParseFactory });
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

test('reading summarize enforces parse prerequisite and persists summary cards after parse', async (t) => {
  const { service, store } = await createHarness();
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
  const { service, store } = await createHarness();
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

test('reading summary and chat can require agent runtime instead of saving fallback prose', async (t) => {
  const { service, store } = await createHarness({
    agentRuntime: {
      async checkAvailability() {
        return false;
      },
    },
    requireAgentRuntime: true,
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

  await assert.rejects(
    () => service.chat(session.id, { message: 'What is the main method?' }),
    /AI chat generation failed: agent runtime unavailable/i,
  );
  const unchanged = await service.getSession(session.id);
  assert.equal(unchanged.chatMessages.length, 0);
});

test('reading chat stores turns with citations after parse', async (t) => {
  const { service, store } = await createHarness();
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
  assert.ok(payload.messages[1].citations.length >= 1);
  assert.equal(payload.session.chatMessages.length, 2);
  assert.equal(payload.session.evidenceCoverage.lastRetrievalConfidence, payload.messages[1].retrieval.confidence);
  assert.equal(payload.session.evidenceCoverage.lastRetrievalTopScore, payload.messages[1].retrieval.topScore);
  assert.equal(payload.session.evidenceCoverage.citedChatCount, 1);
});

test('reading chat refuses unsupported answers when retrieval has no evidence', async (t) => {
  const runtime = {
    async checkAvailability() {
      return true;
    },
    async runJsonTask() {
      return [{ role: 'assistant', content: '{"answer":"The paper evaluates Martian ocean chemistry.","citations":[]}' }];
    },
    parseJsonFromMessages() {
      return {
        answer: 'The paper evaluates Martian ocean chemistry.',
        citations: [],
      };
    },
  };
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
  assert.equal(payload.messages[1].generatedBy, 'fallback');
  assert.equal(payload.messages[1].fallbackReason, 'no matching reading evidence');
  assert.equal(payload.messages[1].citations.length, 0);
  assert.match(payload.messages[1].text, /근거를 충분히 찾지 못했습니다/);
  assert.doesNotMatch(payload.messages[1].text, /Martian ocean chemistry/);
});

test('reading chat uses semantic scorer results when query terms do not overlap chunk text', async (t) => {
  const retrievalScorer = {
    provider: 'test-reranker',
    async scoreChunks({ chunks }) {
      return chunks.map((chunk) => ({
        chunkId: chunk.id,
        score: chunk.id === 'semantic-method' ? 14 : 0,
      }));
    },
  };
  const { rootDir, service, store } = await createHarness({ retrievalScorer });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);
  const artifactPath = path.join(rootDir, parsed.session.parsedArtifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  artifact.chunks = [
    {
      id: 'metadata-note',
      page: 1,
      sectionId: 'abstract',
      sectionLabel: 'Abstract',
      terms: ['dataset', 'license', 'benchmark'],
      text: 'The appendix lists dataset license notes and benchmark provenance.',
    },
    {
      id: 'semantic-method',
      page: 2,
      sectionId: 'method',
      sectionLabel: 'Protocol',
      terms: ['adaptive', 'skipping', 'lowers', 'reranker', 'latency'],
      text: 'Adaptive skipping lowers reranker latency by avoiding expensive scoring on easy examples.',
    },
  ];
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  const payload = await service.chat(session.id, {
    message: 'How does the system reduce expense?',
  });

  assert.equal(payload.messages[1].role, 'assistant');
  assert.notEqual(payload.messages[1].fallbackReason, 'no matching reading evidence');
  assert.equal(payload.messages[1].citations[0].sectionId, 'method');
  assert.equal(payload.messages[1].retrieval.mode, 'hybrid');
  assert.equal(payload.messages[1].retrieval.scorer, 'test-reranker');
  assert.equal(payload.messages[1].retrieval.confidence, 'high');
  assert.equal(payload.messages[1].retrieval.lowConfidence, false);
  assert.ok(payload.messages[1].retrieval.chunks.some((chunk) => chunk.chunkId === 'semantic-method' && chunk.semanticScore === 14));
  assert.match(payload.messages[1].text, /Adaptive skipping lowers reranker latency/);
});

test('reading chat continues with lexical retrieval when configured scorer fails', async (t) => {
  const retrievalScorer = {
    provider: 'failing-reranker',
    async scoreChunks() {
      throw new Error('reranker unavailable');
    },
  };
  const { rootDir, service, store } = await createHarness({ retrievalScorer });
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);
  const artifactPath = path.join(rootDir, parsed.session.parsedArtifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  artifact.chunks = [
    {
      id: 'method-lexical',
      page: 2,
      sectionId: 'method',
      sectionLabel: 'Method',
      terms: ['adaptive', 'skipping', 'reranker', 'latency'],
      text: 'Adaptive skipping lowers reranker latency by skipping expensive scoring on easy examples.',
    },
  ];
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  const payload = await service.chat(session.id, {
    message: 'How does adaptive skipping lower reranker latency?',
  });

  assert.equal(payload.messages[1].role, 'assistant');
  assert.equal(payload.messages[1].retrieval.scorer, 'failing-reranker');
  assert.equal(payload.messages[1].retrieval.chunks[0].semanticScore, 0);
  assert.equal(payload.messages[1].citations[0].sectionId, 'method');
  assert.match(payload.messages[1].text, /Adaptive skipping lowers reranker latency/);
});

test('reading chat rejects low-confidence lexical crumbs', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);
  const artifactPath = path.join(rootDir, parsed.session.parsedArtifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  artifact.chunks = [
    {
      id: 'thin-match',
      page: 1,
      sectionId: 'background',
      sectionLabel: 'Background',
      terms: ['system'],
      text: 'The system stores an appendix note.',
    },
  ];
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  const payload = await service.chat(session.id, {
    message: 'What does the system prove about calibration?',
  });

  assert.equal(payload.messages[1].generatedBy, 'fallback');
  assert.equal(payload.messages[1].fallbackReason, 'no matching reading evidence');
  assert.equal(payload.messages[1].citations.length, 0);
  assert.equal(payload.messages[1].retrieval.confidence, 'none');
  assert.equal(payload.messages[1].retrieval.lowConfidence, true);
  assert.equal(payload.messages[1].retrieval.minEvidenceScore, CHAT_EVIDENCE_POLICY.minEvidenceScore);
  assert.equal(payload.messages[1].retrieval.topScore < CHAT_EVIDENCE_POLICY.minEvidenceScore, true);
});

test('reading chat uses built-in semantic aliases when no scorer is configured', async (t) => {
  const { rootDir, service, store } = await createHarness();
  t.after(async () => {
    await store.close?.();
  });

  const session = await service.createSession({
    paper: buildDemoPaper(),
    projectId: 'demo',
  });
  const parsed = await service.parseSession(session.id);
  const artifactPath = path.join(rootDir, parsed.session.parsedArtifactPath);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  artifact.chunks = [
    {
      id: 'metadata-note',
      page: 1,
      sectionId: 'abstract',
      sectionLabel: 'Abstract',
      terms: ['dataset', 'license', 'benchmark'],
      text: 'The appendix lists dataset license notes and benchmark provenance.',
    },
    {
      id: 'cost-method',
      page: 2,
      sectionId: 'method',
      sectionLabel: 'Protocol',
      terms: ['adaptive', 'skipping', 'lowers', 'reranker', 'latency'],
      text: 'Adaptive skipping lowers reranker latency by avoiding expensive scoring on easy examples.',
    },
  ];
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  const payload = await service.chat(session.id, {
    message: 'How does the system reduce expense?',
  });

  assert.notEqual(payload.messages[1].fallbackReason, 'no matching reading evidence');
  assert.equal(payload.messages[1].citations[0].sectionId, 'method');
  assert.match(payload.messages[1].text, /Adaptive skipping lowers reranker latency/);
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
