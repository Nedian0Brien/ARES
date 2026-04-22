import {
  computeRelevance,
  detectMatchedKeywords,
  extractKeyPoints,
  paperMatchesAnyScope,
  summariseAbstract,
  unique,
} from './search-utils.mjs';

const SEED_PAPERS = [
  {
    paperId: 'seed-rag-adaptive-skip',
    projectIds: ['rag-reranker'],
    title: 'Reducing Reranker Costs in RAG via Adaptive Skipping',
    authors: ['Mina Kim', 'Seongho Park'],
    venue: 'ACL 2024',
    year: 2024,
    abstract:
      'Adaptive skipping reduces reranker calls in retrieval augmented generation systems by estimating confidence before expensive scoring. The approach preserves answer quality on BEIR-style evaluation while cutting reranker compute substantially.',
    keywords: ['rag', 'reranker', 'adaptive skipping', 'beir'],
    citedByCount: 41,
    openAccess: true,
    paperUrl: 'https://example.org/papers/rag-adaptive-skip',
    pdfUrl: 'https://example.org/papers/rag-adaptive-skip.pdf',
  },
  {
    paperId: 'seed-rag-lightweight-reranker',
    projectIds: ['rag-reranker'],
    title: 'Efficient RAG with Lightweight Rerankers',
    authors: ['Yuna Chen', 'J. Rao'],
    venue: 'EMNLP 2024',
    year: 2024,
    abstract:
      'This work studies compact reranker architectures for retrieval augmented generation, showing that smaller cross-encoders preserve most of the ranking quality while dramatically lowering latency.',
    keywords: ['rag', 'reranker', 'latency', 'cross-encoder'],
    citedByCount: 27,
    openAccess: true,
    paperUrl: 'https://example.org/papers/lightweight-rerankers',
    pdfUrl: 'https://example.org/papers/lightweight-rerankers.pdf',
  },
  {
    paperId: 'seed-rag-framework',
    projectIds: ['rag-reranker'],
    title: 'FlashRAG: A Modular Framework for RAG Research',
    authors: ['Wei Jin', 'Tomoko Sato'],
    venue: 'arXiv',
    year: 2024,
    abstract:
      'FlashRAG provides a modular research framework for retrieval augmented generation with configurable retrievers, rerankers, generators, and evaluation harnesses for rapid experimentation.',
    keywords: ['rag', 'framework', 'evaluation', 'retriever'],
    citedByCount: 18,
    openAccess: true,
    paperUrl: 'https://example.org/papers/flashrag',
    pdfUrl: 'https://example.org/papers/flashrag.pdf',
  },
  {
    paperId: 'seed-rag-necessity',
    projectIds: ['rag-reranker'],
    title: 'Is Reranking Really Necessary for RAG?',
    authors: ['Sejin Park', 'Clara Lee'],
    venue: 'ACL Findings 2024',
    year: 2024,
    abstract:
      'The paper examines when reranking materially affects answer quality in retrieval augmented generation and identifies cases where retriever tuning dominates improvements.',
    keywords: ['rag', 'reranker', 'retriever tuning', 'ablation'],
    citedByCount: 12,
    openAccess: false,
    paperUrl: 'https://example.org/papers/reranking-necessary',
    pdfUrl: null,
  },
  {
    paperId: 'seed-raglab',
    projectIds: ['rag-reranker'],
    title: 'RAGLAB: Research-Oriented Unified Framework',
    authors: ['Xin Zhang', 'Hiro Tanaka'],
    venue: 'arXiv',
    year: 2023,
    abstract:
      'RAGLAB unifies retriever, reranker, and generator experimentation with common interfaces for benchmarking and error analysis across multiple RAG tasks.',
    keywords: ['rag', 'benchmark', 'framework', 'error analysis'],
    citedByCount: 29,
    openAccess: true,
    paperUrl: 'https://example.org/papers/raglab',
    pdfUrl: 'https://example.org/papers/raglab.pdf',
  },
  {
    paperId: 'seed-reasoning-verifier',
    projectIds: ['llm-reasoning'],
    title: 'Verifier-Guided Test-Time Scaling for LLM Reasoning',
    authors: ['Dana Choi', 'Alex Murray'],
    venue: 'NeurIPS 2025',
    year: 2025,
    abstract:
      'Verifier-guided decoding improves reasoning reliability by scoring candidate traces and allocating additional compute only when uncertainty is high. The method improves math and symbolic reasoning benchmarks while controlling inference cost.',
    keywords: ['reasoning', 'verifier', 'test-time scaling', 'math benchmark'],
    citedByCount: 22,
    openAccess: false,
    paperUrl: 'https://example.org/papers/verifier-scaling',
    pdfUrl: null,
  },
  {
    paperId: 'seed-self-consistency-budget',
    projectIds: ['llm-reasoning'],
    title: 'Budget-Aware Self-Consistency for Reasoning Models',
    authors: ['Irene Nolan', 'Hyunsoo Yim'],
    venue: 'ICLR 2025',
    year: 2025,
    abstract:
      'This paper adapts self-consistency decoding to dynamic compute budgets by learning when additional samples improve final answer reliability on reasoning tasks.',
    keywords: ['reasoning', 'self consistency', 'budgeting', 'inference'],
    citedByCount: 14,
    openAccess: true,
    paperUrl: 'https://example.org/papers/budget-self-consistency',
    pdfUrl: 'https://example.org/papers/budget-self-consistency.pdf',
  },
  {
    paperId: 'seed-cot-failure-taxonomy',
    projectIds: ['llm-reasoning'],
    title: 'A Failure Taxonomy for Chain-of-Thought Reasoning',
    authors: ['Nadia Brooks', 'Sangmin Han'],
    venue: 'EMNLP 2024',
    year: 2024,
    abstract:
      'We categorize failure patterns in chain-of-thought reasoning and show how verifier feedback can target arithmetic slips, decomposition errors, and inconsistent intermediate states.',
    keywords: ['chain of thought', 'failure analysis', 'verifier', 'reasoning'],
    citedByCount: 31,
    openAccess: true,
    paperUrl: 'https://example.org/papers/cot-failure-taxonomy',
    pdfUrl: 'https://example.org/papers/cot-failure-taxonomy.pdf',
  },
  {
    paperId: 'seed-program-aided-reasoning',
    projectIds: ['llm-reasoning'],
    title: 'Program-Aided Reasoning with Lightweight Verifiers',
    authors: ['Miguel Ortega', 'Sara Bennett'],
    venue: 'ACL 2024',
    year: 2024,
    abstract:
      'Program-aided reasoning improves exactness on symbolic tasks, and lightweight verifier models reject inconsistent reasoning traces before final answer selection.',
    keywords: ['program-aided reasoning', 'verifier', 'symbolic tasks'],
    citedByCount: 26,
    openAccess: false,
    paperUrl: 'https://example.org/papers/program-aided-reasoning',
    pdfUrl: null,
  },
  {
    paperId: 'seed-reasoning-curriculum',
    projectIds: ['llm-reasoning'],
    title: 'Curriculum Signals for Long-Form LLM Reasoning',
    authors: ['J. Patel', 'Eunha Seo'],
    venue: 'arXiv',
    year: 2023,
    abstract:
      'The study explores curriculum-style supervision for long-form reasoning tasks and shows the interaction between data progression and inference-time scaling.',
    keywords: ['reasoning', 'curriculum', 'long-form', 'scaling'],
    citedByCount: 11,
    openAccess: true,
    paperUrl: 'https://example.org/papers/reasoning-curriculum',
    pdfUrl: 'https://example.org/papers/reasoning-curriculum.pdf',
  },
  {
    paperId: 'seed-local-quantization-survey',
    projectIds: ['local-inference'],
    title: 'Practical Quantization Recipes for Local LLM Inference',
    authors: ['Priya Raman', 'Lucas Hart'],
    venue: 'MLSys 2025',
    year: 2025,
    abstract:
      'The paper compares quantization strategies for local inference workloads across consumer GPUs and shows trade-offs between memory footprint, latency, and task quality.',
    keywords: ['local inference', 'quantization', 'latency', 'consumer gpu'],
    citedByCount: 19,
    openAccess: true,
    paperUrl: 'https://example.org/papers/quantization-recipes',
    pdfUrl: 'https://example.org/papers/quantization-recipes.pdf',
  },
  {
    paperId: 'seed-vllm-edge',
    projectIds: ['local-inference'],
    title: 'Edge-Friendly Serving Patterns for vLLM and TensorRT-LLM',
    authors: ['Owen Wright', 'Minji Jeon'],
    venue: 'arXiv',
    year: 2024,
    abstract:
      'We benchmark serving patterns for local and edge deployments using vLLM and TensorRT-LLM, highlighting batching, memory pressure, and cold-start considerations.',
    keywords: ['vllm', 'tensorrt-llm', 'edge deployment', 'serving'],
    citedByCount: 24,
    openAccess: true,
    paperUrl: 'https://example.org/papers/edge-friendly-serving',
    pdfUrl: 'https://example.org/papers/edge-friendly-serving.pdf',
  },
  {
    paperId: 'seed-local-privacy',
    projectIds: ['local-inference'],
    title: 'Private-by-Default Local Inference Pipelines',
    authors: ['Sophia Bell', 'Arjun Mehta'],
    venue: 'USENIX ATC 2024',
    year: 2024,
    abstract:
      'Private-by-default inference pipelines reduce exposure of prompts and artifacts by keeping model execution on local infrastructure and introducing lightweight audit controls.',
    keywords: ['local inference', 'privacy', 'audit', 'deployment'],
    citedByCount: 9,
    openAccess: false,
    paperUrl: 'https://example.org/papers/private-local-inference',
    pdfUrl: null,
  },
  {
    paperId: 'seed-low-vram',
    projectIds: ['local-inference'],
    title: 'Low-VRAM Serving Strategies for Open-Weight Reasoning Models',
    authors: ['Elliot Green', 'Jiwoo Lim'],
    venue: 'EMNLP Industry 2024',
    year: 2024,
    abstract:
      'We analyze scheduling and quantization strategies for running reasoning-capable open-weight models in constrained VRAM settings without catastrophic latency spikes.',
    keywords: ['low vram', 'open-weight models', 'quantization', 'latency'],
    citedByCount: 15,
    openAccess: true,
    paperUrl: 'https://example.org/papers/low-vram-serving',
    pdfUrl: 'https://example.org/papers/low-vram-serving.pdf',
  },
  {
    paperId: 'seed-local-observability',
    projectIds: ['local-inference'],
    title: 'Observability for On-Prem LLM Serving',
    authors: ['Kenji Mori', 'Amelia Ross'],
    venue: 'SREcon 2023',
    year: 2023,
    abstract:
      'The paper introduces a monitoring blueprint for on-prem model serving that links throughput, GPU pressure, cache misses, and user-perceived latency.',
    keywords: ['observability', 'llm serving', 'latency', 'gpu metrics'],
    citedByCount: 6,
    openAccess: true,
    paperUrl: 'https://example.org/papers/local-observability',
    pdfUrl: 'https://example.org/papers/local-observability.pdf',
  },
];

function seedMatchesPaper(projectId, query, paper) {
  const target = `${paper.title} ${paper.abstract} ${paper.keywords.join(' ')}`.toLowerCase();
  const queryTerms = unique(String(query || '').toLowerCase().split(/\s+/).filter(Boolean));

  if (paper.projectIds.includes(projectId)) {
    return true;
  }

  if (!queryTerms.length) {
    return false;
  }

  return queryTerms.every((term) => target.includes(term.replaceAll('"', '')));
}

function normaliseSeedPaper(paper, { project, query }) {
  const matchedKeywords = detectMatchedKeywords(paper, [...(project?.keywords || []), ...paper.keywords]);
  const relevance = computeRelevance({
    rawRelevance: 0.82,
    title: paper.title,
    abstract: paper.abstract,
    keywords: paper.keywords,
    citedByCount: paper.citedByCount,
    year: paper.year,
    project,
    query,
  });

  return {
    ...paper,
    sourceProvider: 'seed',
    sourceName: 'ARES seed library',
    summary: summariseAbstract(paper.abstract),
    keyPoints: extractKeyPoints({
      abstract: paper.abstract,
      keywords: paper.keywords,
      citedByCount: paper.citedByCount,
      venue: paper.venue,
      year: paper.year,
      openAccess: paper.openAccess,
    }),
    matchedKeywords,
    relevance,
  };
}

export function searchSeedPapers({ project, query = '', page = 1, perPage = 20, scopes = [] }) {
  const candidates = SEED_PAPERS.filter((paper) => seedMatchesPaper(project.id, query, paper))
    .map((paper) => normaliseSeedPaper(paper, { project, query }))
    .filter((paper) => paperMatchesAnyScope(paper, scopes))
    .sort((left, right) => right.relevance - left.relevance || right.citedByCount - left.citedByCount);

  const start = (page - 1) * perPage;
  const results = candidates.slice(start, start + perPage);

  return {
    provider: 'seed',
    live: false,
    total: candidates.length,
    results,
  };
}
