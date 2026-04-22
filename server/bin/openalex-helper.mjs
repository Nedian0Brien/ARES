#!/usr/bin/env node

import { searchOpenAlex } from '../lib/openalex.mjs';
import { normaliseSearchScope } from '../lib/search-contract.mjs';

function parseArgs(argv) {
  const keywords = [];
  const scopeFlags = [];
  const parsed = {
    page: 1,
    perPage: 24,
    query: '',
    projectId: 'scout-project',
    projectFocus: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--query' && next !== undefined) {
      parsed.query = next;
      index += 1;
      continue;
    }

    if (arg === '--project-id' && next !== undefined) {
      parsed.projectId = next;
      index += 1;
      continue;
    }

    if (arg === '--project-focus' && next !== undefined) {
      parsed.projectFocus = next;
      index += 1;
      continue;
    }

    if (arg === '--project-keyword' && next !== undefined) {
      keywords.push(next);
      index += 1;
      continue;
    }

    if (arg === '--scope' && next !== undefined) {
      scopeFlags.push(next);
      index += 1;
      continue;
    }

    if (arg === '--page' && next !== undefined) {
      parsed.page = Math.max(1, Number(next) || 1);
      index += 1;
      continue;
    }

    if (arg === '--per-page' && next !== undefined) {
      parsed.perPage = Math.max(1, Number(next) || 24);
      index += 1;
    }
  }

  parsed.keywords = keywords;
  parsed.scopes = scopeFlags
    .map((value) => {
      const [type, ...labelParts] = String(value || '').split('::');
      return normaliseSearchScope({
        id: value,
        type,
        label: labelParts.join('::'),
      });
    })
    .filter(Boolean);

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.query.trim()) {
    throw new Error('--query is required.');
  }

  const payload = await searchOpenAlex({
    apiKey: process.env.OPENALEX_API_KEY || '',
    mailto: process.env.OPENALEX_MAILTO || '',
    page: args.page,
    perPage: args.perPage,
    project: {
      id: args.projectId,
      focus: args.projectFocus,
      keywords: args.keywords,
    },
    query: args.query,
    scopes: args.scopes,
  });

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
