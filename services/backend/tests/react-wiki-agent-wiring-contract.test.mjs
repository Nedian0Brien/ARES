import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('React Wiki tab reads server wiki pages and graph instead of rendering mock arrays as assets', async () => {
  const source = await readProjectFile('web/src/tabs/wiki/WikiTab.jsx');

  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/wiki\$\{wikiQuery\}`\)/);
  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/wiki\/graph\$\{wikiQuery\}`\)/);
  assert.match(source, /pagesState\.data\?\.folders/);
  assert.match(source, /setCat\(folder\.id\)/);
  assert.match(source, /LiveWikiGraph/);
  assert.match(source, /아직 저장된 Wiki 문서가 없습니다/);
});

test('React Wiki tab does not expose backend implementation labels in visible copy', async () => {
  const source = await readProjectFile('web/src/tabs/wiki/WikiTab.jsx');

  assert.match(source, /loading &&/);
  assert.match(source, /동기화 중/);
  assert.doesNotMatch(source, /연결된 문서/);
  assert.doesNotMatch(source, /server-backed/);
  assert.doesNotMatch(source, />syncing</);
});

test('React Wiki tab opens the most connected page instead of trusting API order', async () => {
  const source = await readProjectFile('web/src/tabs/wiki/WikiTab.jsx');

  assert.match(source, /function featuredWikiPage\(pages\)/);
  assert.match(source, /right\.links\.length - left\.links\.length/);
  assert.match(source, /right\.paperIds\.length - left\.paperIds\.length/);
  assert.match(source, /const visiblePages = useMemo/);
  assert.match(source, /const featuredPage = useMemo\(\(\) => featuredWikiPage\(visiblePages\), \[visiblePages\]\)/);
  assert.match(source, /const selectedPage = pagesById\[sel\] \|\| featuredPage \|\| null/);
  assert.match(source, /setSel\(featuredPage\.id\)/);
});

test('React Wiki tab does not expose disconnected synthesis as an enabled action', async () => {
  const source = await readProjectFile('web/src/tabs/wiki/WikiTab.jsx');

  assert.match(source, /<button className="btn-s" disabled title="아직 사용할 수 없습니다\." type="button"><Icon name="sparkles" size=\{13\} color=\{T\.search\}\/> Re-synthesize<\/button>/);
  assert.doesNotMatch(source, /wiki\/synthesize/);
  assert.doesNotMatch(source, /catch\(\(\) => \{\}\)/);
});

test('React Agent tab stores real thread messages without fabricating assistant output', async () => {
  const source = await readProjectFile('web/src/tabs/agent/AgentTab.jsx');

  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/agent\/threads`\)/);
  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/agent\/threads\/\$\{encodeURIComponent\(threadId\)\}\/messages`/);
  assert.match(source, /api\(`api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/agent\/threads\/\$\{encodeURIComponent\(selectedThreadId\)\}\/messages\/\$\{encodeURIComponent\(message\.id\)\}\/save`/);
  assert.match(source, /onSaveMessage\(message,\s*'note'\)/);
  assert.match(source, /savedItems=\{artifacts\}/);
  assert.match(source, /result\.assistantGenerated/);
  assert.match(source, /질문이 저장되었습니다/);
});

test('React Agent tab subscribes to queued agent-run events and refreshes generated replies', async () => {
  const source = await readProjectFile('web/src/tabs/agent/AgentTab.jsx');

  assert.match(source, /useAgentRunEvents/);
  assert.match(source, /activeAgentRunId/);
  assert.match(source, /result\.agentRun\?\.id/);
  assert.match(source, /agentRunEvents\.latestRun/);
  assert.match(source, /setRefreshVersion\(\(value\) => value \+ 1\)/);
  assert.match(source, /답변이 도착했습니다/);
});
