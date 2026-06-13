export function createDraftFeatureModel(projectGraph = {}) {
  const insightCards = Array.isArray(projectGraph.insightCards) ? projectGraph.insightCards : [];
  return {
    acceptedInsightCards: insightCards.filter((card) => card?.status === "accepted"),
    draftSections: Array.isArray(projectGraph.draftSections) ? projectGraph.draftSections : [],
    drafts: Array.isArray(projectGraph.drafts) ? projectGraph.drafts : [],
    insightCards,
  };
}
