import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildDraftExportBundle,
  createDraftFeatureModel,
  validateDraftExportSources,
} from '../../../web/app/features/draft.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('Writing tab renders a dedicated evidence-backed drafting surface', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function renderWritingStage/);
  assert.match(appJs, /data-ares-surface="writing-stage"/);
  assert.match(appJs, /state\.activeStage === "writing"/);
  assert.match(appJs, /renderWritingStage\(project\)/);
  assert.match(appJs, /createDraftFeatureModel/);
  assert.match(appJs, /createDraftSectionFromInsight/);
});

test('Writing surface exposes user-facing outline, draft, sources, and evidence concepts', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Outline/);
  assert.match(appJs, /Draft/);
  assert.match(appJs, /Sources/);
  assert.match(appJs, /Evidence Bundle/);
  assert.match(appJs, /Evidence gaps/);
  assert.match(appJs, /source-linked draft/);
  assert.doesNotMatch(appJs, /AI suggestion/);
});

test('Writing actions cover generation, evidence insertion, suggestions, and export', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /Generate section/);
  assert.match(appJs, /data-action="create-draft-section"/);
  assert.match(appJs, /Insert evidence/);
  assert.match(appJs, /Accept suggestion/);
  assert.match(appJs, /data-action="export-writing-draft"/);
  assert.match(appJs, /Export/);
});

test('Writing section creation requires an existing draft instead of creating one implicitly', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /async function createDraftSectionFromInsight/);
  assert.match(appJs, /Create a draft first/);
  assert.doesNotMatch(appJs, /await api\(`api\/projects\/\\$\\{encodeURIComponent\(project\.id\)\\}\/drafts`/);
});

test('Writing default draft candidates include only accepted insight cards', () => {
  const model = createDraftFeatureModel({
    insightCards: [
      { claim: 'Candidate claim', id: 'insight-candidate', status: 'candidate' },
      { claim: 'Accepted claim', id: 'insight-accepted', status: 'accepted' },
      { claim: 'Rejected claim', id: 'insight-rejected', status: 'rejected' },
    ],
  });

  assert.deepEqual(model.acceptedInsightCards.map((card) => card.id), ['insight-accepted']);
  assert.deepEqual(model.insightCards.map((card) => card.id), [
    'insight-candidate',
    'insight-accepted',
    'insight-rejected',
  ]);
});

test('Writing draft sections can be selected, edited, and deleted before export', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /activeDraftSectionId/);
  assert.match(appJs, /data-action="select-draft-section"/);
  assert.match(appJs, /data-action="submit-draft-section-form"/);
  assert.match(appJs, /name="draftSectionTitle"/);
  assert.match(appJs, /name="draftSectionBody"/);
  assert.match(appJs, /saveDraftSectionEdit/);
  assert.match(appJs, /data-action="delete-draft-section"/);
  assert.match(appJs, /deleteDraftSection/);
  assert.match(appJs, /confirmDelete: true/);
  assert.match(appJs, /reason: `Delete draft section/);
});

test('Writing export preserves citations and warns about broken sources', async () => {
  const [appJs, draftJs] = await Promise.all([readProjectFile('web/app.js'), readProjectFile('web/app/features/draft.js')]);

  assert.match(appJs, /function buildWritingExportMarkdown/);
  assert.match(appJs, /buildDraftExportBundle/);
  assert.match(draftJs, /## Source appendix/);
  assert.match(draftJs, /## Broken source warnings/);
  assert.match(draftJs, /missingEvidenceLinkIds/);
  assert.match(draftJs, /\[\^src-\$\{index \+ 1\}\]/);
  assert.match(draftJs, /evidenceLinkIds/);
  assert.match(appJs, /copyTextToClipboard\(buildWritingExportMarkdown\(\)/);
});

test('Writing export builder creates Markdown, HTML, BibTeX, and CSL JSON snapshots', () => {
  const bundle = buildDraftExportBundle({
    draftTitle: 'Adaptive retrieval memo',
    evidenceLinks: [
      {
        id: 'evidence-1',
        page: 7,
        paperId: 'paper-1',
        quote: 'Adaptive retrieval reduced redundant chunks.',
        sourceType: 'paper',
        title: 'Adaptive Retrieval for Research Agents',
        url: 'https://example.test/paper',
      },
    ],
    sections: [
      {
        body: 'Adaptive retrieval should be the default scorer path.',
        evidenceLinkIds: ['evidence-1', 'missing-evidence'],
        title: 'Recommendation',
      },
    ],
  });

  assert.match(bundle.markdown, /## Recommendation/);
  assert.match(bundle.markdown, /\[\^src-1\]/);
  assert.match(bundle.markdown, /## Broken source warnings/);
  assert.match(bundle.html, /<!doctype html>/);
  assert.match(bundle.html, /<h2>Recommendation<\/h2>/);
  assert.match(bundle.bibtex, /@misc\{paper-1/);
  assert.match(bundle.cslJson, /"id": "paper-1"/);
  assert.deepEqual(bundle.missingEvidenceLinkIds, ['missing-evidence']);
  assert.equal(bundle.sourceValidation.status, 'warning');
  assert.deepEqual(bundle.sourceValidation.warnings, ['Missing evidence link: missing-evidence']);
});

test('Writing export source validation blocks empty drafts and warns on missing evidence', () => {
  assert.deepEqual(validateDraftExportSources({ evidenceLinks: [], sections: [] }), {
    blockers: ['Create a draft section before export.'],
    missingEvidenceLinkIds: [],
    status: 'blocked',
    usedEvidenceIds: [],
    warnings: [],
  });

  assert.deepEqual(
    validateDraftExportSources({
      evidenceLinks: [{ id: 'evidence-1' }],
      sections: [{ evidenceLinkIds: ['evidence-1', 'missing-evidence'] }],
    }),
    {
      blockers: [],
      missingEvidenceLinkIds: ['missing-evidence'],
      status: 'warning',
      usedEvidenceIds: ['evidence-1'],
      warnings: ['Missing evidence link: missing-evidence'],
    },
  );
});
