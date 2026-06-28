function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function evidenceCitationKey(evidence: Record<string, unknown>): string {
  const source = text(evidence.paperId, text(evidence.sourceId, text(evidence.id, 'source')))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return source || 'source';
}

function evidenceCitationLine(evidence: Record<string, unknown>, index: number): string {
  const sourceType = text(evidence.sourceType, 'evidence');
  const page = text(evidence.page) ? `, p.${text(evidence.page)}` : '';
  const quote = text(evidence.quote, 'Linked evidence').replace(/\s+/g, ' ').trim();
  return `[^src-${index + 1}]: ${sourceType}${page}. ${quote}`;
}

function sourceTitle(evidence: Record<string, unknown>): string {
  return text(evidence.title, text(evidence.paperTitle, text(evidence.sourceId, text(evidence.paperId, text(evidence.id, 'Linked source'))))).trim();
}

function buildBibtexEntry(evidence: Record<string, unknown>): string {
  const key = evidenceCitationKey(evidence);
  const fields = [
    ['title', sourceTitle(evidence)],
    ['note', text(evidence.quote)],
    ['url', text(evidence.url, text(evidence.sourceUrl))],
  ].filter(([, value]) => String(value || '').trim());
  const body = fields.map(([name, value]) => `  ${name} = {${String(value).replace(/[{}]/g, '')}}`).join(',\n');
  return `@misc{${key},\n${body}\n}`;
}

function buildCslItem(evidence: Record<string, unknown>): Record<string, unknown> {
  const year = Number(evidence.year);
  return {
    id: evidenceCitationKey(evidence),
    issued: Number.isFinite(year) ? { 'date-parts': [[year]] } : undefined,
    note: text(evidence.quote) || undefined,
    title: sourceTitle(evidence),
    type: 'article',
    URL: text(evidence.url, text(evidence.sourceUrl)) || undefined,
  };
}

function uniqueEvidenceIds(sections: Record<string, unknown>[], evidenceById: Map<string, Record<string, unknown>>) {
  const usedEvidenceIds: string[] = [];
  const missingEvidenceLinkIds: string[] = [];

  for (const section of sections) {
    const sectionEvidenceIds = stringArray(section.evidenceLinkIds);
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

function evidenceEntryPairs(evidenceLinks: Record<string, unknown>[]): Array<[string, Record<string, unknown>]> {
  return evidenceLinks.flatMap((entry) => {
    const id = text(entry.id);
    return id ? [[id, entry]] : [];
  });
}

export function validateDraftExportSources({
  evidenceLinks = [],
  sections = [],
}: {
  evidenceLinks?: Record<string, unknown>[];
  sections?: Record<string, unknown>[];
} = {}) {
  const evidenceById = new Map(evidenceEntryPairs(evidenceLinks));
  const { missingEvidenceLinkIds, usedEvidenceIds } = uniqueEvidenceIds(sections, evidenceById);
  const warnings = missingEvidenceLinkIds.map((id) => `Missing evidence link: ${id}`);
  const blockers = sections.length ? [] : ['Create a draft section before export.'];

  return {
    blockers,
    missingEvidenceLinkIds,
    status: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'passed',
    usedEvidenceIds,
    warnings,
  };
}

export function buildDraftExportBundle({
  draftTitle = 'ARES draft',
  evidenceLinks = [],
  sections = [],
}: {
  draftTitle?: string;
  evidenceLinks?: Record<string, unknown>[];
  sections?: Record<string, unknown>[];
} = {}) {
  const evidenceById = new Map(evidenceEntryPairs(evidenceLinks));
  const sourceValidation = validateDraftExportSources({ evidenceLinks, sections });
  const { missingEvidenceLinkIds, usedEvidenceIds } = sourceValidation;

  const markdownBody = sections
    .map((section) => {
      const markers = stringArray(section.evidenceLinkIds)
        .map((id) => {
          const index = usedEvidenceIds.indexOf(id);
          return index >= 0 ? `[^src-${index + 1}]` : '';
        })
        .filter(Boolean)
        .join(' ');
      const suffix = markers ? `\n\n${markers}` : '';
      return [`## ${text(section.title, 'Untitled section')}`, '', `${text(section.body)}${suffix}`].join('\n');
    })
    .join('\n\n');
  const emptyEvidence: Record<string, unknown> = {};
  const appendix = usedEvidenceIds.length
    ? ['## Source appendix', '', ...usedEvidenceIds.map((id, index) => evidenceCitationLine(evidenceById.get(id) || emptyEvidence, index))]
    : ['## Source appendix', '', '_No linked sources._'];
  const warnings = missingEvidenceLinkIds.length
    ? ['', '## Broken source warnings', '', ...missingEvidenceLinkIds.map((id) => `- Missing evidence link: ${id}`)]
    : [];
  const markdown = [markdownBody, ...appendix, ...warnings].join('\n\n');

  const htmlSections = sections
    .map((section) => {
      const markers = stringArray(section.evidenceLinkIds)
        .map((id) => {
          const index = usedEvidenceIds.indexOf(id);
          return index >= 0 ? `<sup id="ref-src-${index + 1}">[${index + 1}]</sup>` : '';
        })
        .join('');
      return `<section><h2>${escapeHtml(text(section.title, 'Untitled section'))}</h2><p>${escapeHtml(text(section.body))}</p>${markers}</section>`;
    })
    .join('\n');
  const htmlSources = usedEvidenceIds
    .map((id, index) => `<li id="src-${index + 1}">${escapeHtml(evidenceCitationLine(evidenceById.get(id) || emptyEvidence, index))}</li>`)
    .join('');
  const htmlWarnings = missingEvidenceLinkIds.length
    ? `<section><h2>Broken source warnings</h2><ul>${missingEvidenceLinkIds
        .map((id) => `<li>Missing evidence link: ${escapeHtml(id)}</li>`)
        .join('')}</ul></section>`
    : '';
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(draftTitle)}</title></head><body><main>${htmlSections}<section><h2>Source appendix</h2><ol>${htmlSources}</ol></section>${htmlWarnings}</main></body></html>`;

  const bibliographyItems = usedEvidenceIds.map((id) => evidenceById.get(id)).filter((entry): entry is Record<string, unknown> => Boolean(entry));

  return {
    bibtex: bibliographyItems.map(buildBibtexEntry).join('\n\n'),
    cslJson: JSON.stringify(bibliographyItems.map(buildCslItem), null, 2),
    html,
    markdown,
    missingEvidenceLinkIds,
    sourceValidation,
    usedEvidenceIds,
  };
}
