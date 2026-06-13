export const SURFACE_ROUTE_ALIASES = {
  papers: "reading",
  lab: "research",
  search: "search",
  reading: "reading",
  research: "research",
  result: "result",
  insight: "insight",
  writing: "writing",
  read: "reading",
  results: "result",
  insights: "insight",
};

export function createSurfaceRouteNormalizer({ aliases = SURFACE_ROUTE_ALIASES, fallback = "search", stages = [] } = {}) {
  const validStageIds = new Set(stages.map((stage) => stage.id));

  return function normalizeSurfaceRoute(stageId) {
    const resolved = aliases[stageId] || stageId;
    return validStageIds.has(resolved) ? resolved : fallback;
  };
}
