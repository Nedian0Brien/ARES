export function createDraftFeatureModel(projectGraph = {}) {
  const insightCards = Array.isArray(projectGraph.insightCards) ? projectGraph.insightCards : [];
  return {
    acceptedInsightCards: insightCards.filter((card) => card?.status === "accepted"),
    draftSections: Array.isArray(projectGraph.draftSections) ? projectGraph.draftSections : [],
    drafts: Array.isArray(projectGraph.drafts) ? projectGraph.drafts : [],
    insightCards,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function evidenceCitationKey(evidence = {}) {
  const source = String(evidence.paperId || evidence.sourceId || evidence.id || "source")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return source || "source";
}

function evidenceCitationLine(evidence, index) {
  const sourceType = evidence.sourceType || "evidence";
  const page = evidence.page ? `, p.${evidence.page}` : "";
  const quote = String(evidence.quote || "Linked evidence").replace(/\s+/g, " ").trim();
  return `[^src-${index + 1}]: ${sourceType}${page}. ${quote}`;
}

function sourceTitle(evidence = {}) {
  return String(evidence.title || evidence.paperTitle || evidence.sourceId || evidence.paperId || evidence.id || "Linked source").trim();
}

function buildBibtexEntry(evidence = {}) {
  const key = evidenceCitationKey(evidence);
  const fields = [
    ["title", sourceTitle(evidence)],
    ["note", evidence.quote || ""],
    ["url", evidence.url || evidence.sourceUrl || ""],
  ].filter(([, value]) => String(value || "").trim());
  const body = fields.map(([name, value]) => `  ${name} = {${String(value).replace(/[{}]/g, "")}}`).join(",\n");
  return `@misc{${key},\n${body}\n}`;
}

function buildCslItem(evidence = {}) {
  return {
    id: evidenceCitationKey(evidence),
    issued: evidence.year ? { "date-parts": [[Number(evidence.year)]] } : undefined,
    note: evidence.quote || undefined,
    title: sourceTitle(evidence),
    type: "article",
    URL: evidence.url || evidence.sourceUrl || undefined,
  };
}

function uniqueEvidenceIds(sections = [], evidenceById = new Map()) {
  const usedEvidenceIds = [];
  const missingEvidenceLinkIds = [];

  for (const section of sections) {
    const sectionEvidenceIds = Array.isArray(section.evidenceLinkIds) ? section.evidenceLinkIds : [];
    for (const id of sectionEvidenceIds) {
      if (!evidenceById.has(id)) {
        missingEvidenceLinkIds.push(id);
        continue;
      }
      if (!usedEvidenceIds.includes(id)) {
        usedEvidenceIds.push(id);
      }
    }
  }

  return { missingEvidenceLinkIds, usedEvidenceIds };
}

export function buildDraftExportBundle({ draftTitle = "ARES draft", evidenceLinks = [], sections = [] } = {}) {
  const evidenceById = new Map(evidenceLinks.map((entry) => [entry.id, entry]));
  const { missingEvidenceLinkIds, usedEvidenceIds } = uniqueEvidenceIds(sections, evidenceById);

  const markdownBody = sections
    .map((section) => {
      const markers = (Array.isArray(section.evidenceLinkIds) ? section.evidenceLinkIds : [])
        .map((id) => {
          const index = usedEvidenceIds.indexOf(id);
          return index >= 0 ? `[^src-${index + 1}]` : "";
        })
        .filter(Boolean)
        .join(" ");
      const suffix = markers ? `\n\n${markers}` : "";
      return [`## ${section.title || "Untitled section"}`, "", `${section.body || ""}${suffix}`].join("\n");
    })
    .join("\n\n");
  const appendix = usedEvidenceIds.length
    ? ["## Source appendix", "", ...usedEvidenceIds.map((id, index) => evidenceCitationLine(evidenceById.get(id), index))]
    : ["## Source appendix", "", "_No linked sources._"];
  const warnings = missingEvidenceLinkIds.length
    ? ["", "## Broken source warnings", "", ...missingEvidenceLinkIds.map((id) => `- Missing evidence link: ${id}`)]
    : [];
  const markdown = [markdownBody, ...appendix, ...warnings].join("\n\n");

  const htmlSections = sections
    .map((section) => {
      const markers = (Array.isArray(section.evidenceLinkIds) ? section.evidenceLinkIds : [])
        .map((id) => {
          const index = usedEvidenceIds.indexOf(id);
          return index >= 0 ? `<sup id="ref-src-${index + 1}">[${index + 1}]</sup>` : "";
        })
        .join("");
      return `<section><h2>${escapeHtml(section.title || "Untitled section")}</h2><p>${escapeHtml(section.body || "")}</p>${markers}</section>`;
    })
    .join("\n");
  const htmlSources = usedEvidenceIds
    .map((id, index) => `<li id="src-${index + 1}">${escapeHtml(evidenceCitationLine(evidenceById.get(id), index))}</li>`)
    .join("");
  const htmlWarnings = missingEvidenceLinkIds.length
    ? `<section><h2>Broken source warnings</h2><ul>${missingEvidenceLinkIds
        .map((id) => `<li>Missing evidence link: ${escapeHtml(id)}</li>`)
        .join("")}</ul></section>`
    : "";
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(draftTitle)}</title></head><body><main>${htmlSections}<section><h2>Source appendix</h2><ol>${htmlSources}</ol></section>${htmlWarnings}</main></body></html>`;

  const bibliographyItems = usedEvidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);

  return {
    bibtex: bibliographyItems.map(buildBibtexEntry).join("\n\n"),
    cslJson: JSON.stringify(bibliographyItems.map(buildCslItem), null, 2),
    html,
    markdown,
    missingEvidenceLinkIds,
    usedEvidenceIds,
  };
}
