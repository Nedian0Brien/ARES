export function createQueueFeatureModel(projectGraph = {}) {
  const questions = Array.isArray(projectGraph.researchQuestions) ? projectGraph.researchQuestions : [];
  const papers = Array.isArray(projectGraph.papers) ? projectGraph.papers : [];

  return {
    activeQuestion: questions.find((question) => question.status === "active") || questions[0] || null,
    papers,
    questions,
  };
}
