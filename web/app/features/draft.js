export function createDraftFeatureModel(projectGraph = {}) {
  return {
    draftSections: Array.isArray(projectGraph.draftSections) ? projectGraph.draftSections : [],
    drafts: Array.isArray(projectGraph.drafts) ? projectGraph.drafts : [],
    insightCards: Array.isArray(projectGraph.insightCards) ? projectGraph.insightCards : [],
  };
}
