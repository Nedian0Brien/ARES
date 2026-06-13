export function graphEvidenceItems(projectGraph = {}) {
  const evidenceLinks = Array.isArray(projectGraph.evidenceLinks) ? projectGraph.evidenceLinks : [];
  const resultDossiers = Array.isArray(projectGraph.resultDossiers) ? projectGraph.resultDossiers : [];
  const linkItems = evidenceLinks.map((link) => ({
    cat: link.sourceType === "note" ? "paper quote" : link.sourceType || "evidence",
    evidenceLinkIds: [link.id].filter(Boolean),
    page: link.page || link.locator?.page || "",
    text: link.quote || "Linked evidence",
  }));
  const resultItems = resultDossiers.flatMap((dossier) =>
    (Array.isArray(dossier.comparisons) ? dossier.comparisons : []).map((comparison) => ({
      cat: "result delta",
      evidenceLinkIds: Array.isArray(dossier.evidenceLinkIds) ? dossier.evidenceLinkIds : [],
      page: "",
      text: comparison.summary || comparison.delta || dossier.deltaSummary || "Result delta",
    })),
  );
  return [...linkItems, ...resultItems];
}
