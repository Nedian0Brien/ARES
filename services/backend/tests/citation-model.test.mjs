import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCitationKey,
  formatBibliographyItem,
  formatCitationMarker,
  normaliseBibliographyItem,
  normaliseCitation,
} from '../lib/citation-model.mjs';

test('citation key is stable from author year and title', () => {
  assert.equal(
    buildCitationKey({
      authors: ['Ada Lovelace', 'Alan Turing'],
      title: 'Adaptive Retrieval for Research Agents',
      year: 2026,
    }),
    'lovelace-2026-adaptive',
  );
});

test('normaliseBibliographyItem separates source metadata and citation style', () => {
  const item = normaliseBibliographyItem({
    authors: ['Ada Lovelace'],
    sourceId: 'paper-1',
    sourceType: 'paper',
    style: { defaultStyle: 'apa', metadata: { locale: 'en-US' } },
    title: 'Adaptive Retrieval for Research Agents',
    url: 'https://example.test/paper',
    venue: 'ARES Conf',
    year: 2026,
  });

  assert.equal(item.citationKey, 'lovelace-2026-adaptive');
  assert.equal(item.sourceId, 'paper-1');
  assert.equal(item.sourceType, 'paper');
  assert.deepEqual(item.style, { defaultStyle: 'apa', metadata: { locale: 'en-US' } });
});

test('normaliseCitation preserves locator and evidence binding', () => {
  const citation = normaliseCitation({
    bibliographyItemId: 'bib-1',
    citationKey: 'lovelace-2026-adaptive',
    evidenceLinkId: 'evidence-1',
    locator: { page: 7, quote: 'adaptive retrieval reduces cost', sectionId: 'method' },
    style: { marker: '[1, p. 7]', name: 'ieee' },
  });

  assert.equal(citation.bibliographyItemId, 'bib-1');
  assert.equal(citation.evidenceLinkId, 'evidence-1');
  assert.deepEqual(citation.locator, {
    label: '',
    page: 7,
    quote: 'adaptive retrieval reduces cost',
    sectionId: 'method',
  });
  assert.deepEqual(citation.style, { marker: '[1, p. 7]', name: 'ieee' });
});

test('citation formatter renders IEEE and APA bibliography snapshots', () => {
  const item = {
    authors: ['Ada Lovelace', 'Alan Turing'],
    doi: '10.5555/ares.2026.1',
    title: 'Adaptive Retrieval for Research Agents',
    venue: 'ARES Conf',
    year: 2026,
  };

  assert.equal(
    formatBibliographyItem(item, { index: 3, style: 'ieee' }),
    '[3] Ada Lovelace, Alan Turing, "Adaptive Retrieval for Research Agents," ARES Conf, 2026. doi: 10.5555/ares.2026.1.',
  );
  assert.equal(
    formatBibliographyItem(item, { style: 'apa' }),
    'Lovelace, A., & Turing, A. (2026). Adaptive Retrieval for Research Agents. ARES Conf. https://doi.org/10.5555/ares.2026.1',
  );
});

test('citation formatter renders style-specific inline markers', () => {
  assert.equal(formatCitationMarker({ locator: { page: 7 }, style: { name: 'ieee' } }, { index: 2 }), '[2, p. 7]');
  assert.equal(
    formatCitationMarker({ citationKey: 'lovelace-2026-adaptive', locator: { page: 7 }, style: { name: 'apa' } }),
    '(lovelace-2026-adaptive, p. 7)',
  );
});
