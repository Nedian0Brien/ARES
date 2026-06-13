import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

const STYLE_FILES = [
  'web/styles.css',
  'web/styles/base.css',
  'web/styles/lab.css',
  'web/styles/insight.css',
  'web/styles/writing.css',
  'web/styles/reading.css',
  'web/styles/search.css',
];

async function readProjectStyles() {
  const chunks = await Promise.all(STYLE_FILES.map((relativePath) => readProjectFile(relativePath)));
  return chunks.join('\n');
}

test('mobile bottom nav ports ARIS auto-hide reducer thresholds', async () => {
  const { primeAutoHideScrollState, reduceAutoHideScrollState } = await import(
    pathToFileURL(path.join(rootDir, 'web/app/lib/mobile-scroll-auto-hide.js')).href
  );

  const thresholds = {
    nearTopThreshold: 32,
    hideAfterScrollY: 72,
    hideDeltaThreshold: 8,
    revealDeltaThreshold: 8,
  };

  assert.deepEqual(primeAutoHideScrollState({ currentY: 420, now: 2_000, resumeGuardMs: 240 }), {
    hidden: false,
    lastScrollY: 420,
    resumeGuardUntil: 2_240,
  });

  assert.equal(
    reduceAutoHideScrollState({
      state: { hidden: false, lastScrollY: 80, resumeGuardUntil: 0 },
      currentY: 96,
      now: 3_000,
      isMobile: true,
      thresholds,
    }).hidden,
    true,
  );

  assert.equal(
    reduceAutoHideScrollState({
      state: { hidden: true, lastScrollY: 180, resumeGuardUntil: 0 },
      currentY: 160,
      now: 3_000,
      isMobile: true,
      thresholds,
    }).hidden,
    false,
  );

  assert.equal(
    reduceAutoHideScrollState({
      state: { hidden: true, lastScrollY: 80, resumeGuardUntil: 0 },
      currentY: 240,
      now: 3_000,
      isMobile: false,
      thresholds,
    }).hidden,
    false,
  );
});

test('mobile bottom nav markup includes ARIS floating indicator and nav-item anatomy', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /renderBottomNav\(\)[\s\S]*bottom-nav-indicator/);
  assert.match(appJs, /class="nav-item \$\{active \? "active" : ""\}"/);
  assert.match(appJs, /aria-current="\$\{active \? "page" : "false"\}"/);
  assert.match(appJs, /data-bottom-nav-tab="\$\{escapeHtml\(tab\.id\)\}"/);
});

test('mobile bottom nav wires ARIS scroll auto-hide lifecycle without omitted events', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /AUTO_HIDE_RESUME_GUARD_MS\s*=\s*240/);
  assert.match(appJs, /nearTopThreshold:\s*32/);
  assert.match(appJs, /hideAfterScrollY:\s*72/);
  assert.match(appJs, /hideDeltaThreshold:\s*8/);
  assert.match(appJs, /revealDeltaThreshold:\s*8/);
  assert.match(appJs, /requestAnimationFrame\(updateBottomNavVisibility\)/);
  assert.match(appJs, /window\.addEventListener\("scroll",\s*onBottomNavScroll,\s*\{\s*passive:\s*true\s*\}\)/);
  assert.match(appJs, /window\.addEventListener\("resize",\s*onBottomNavResize\)/);
  assert.match(appJs, /window\.addEventListener\("focus",\s*onBottomNavResume\)/);
  assert.match(appJs, /window\.addEventListener\("pageshow",\s*onBottomNavResume\)/);
  assert.match(appJs, /document\.addEventListener\("visibilitychange",\s*onBottomNavResume\)/);
  assert.match(appJs, /document\.addEventListener\("scroll",\s*onBottomNavScroll,\s*\{\s*passive:\s*true,\s*capture:\s*true\s*\}\)/);
  assert.match(appJs, /window\.addEventListener\("orientationchange",\s*syncBottomNavIndicator\)/);
});

test('mobile viewport chrome syncs iOS Safari bottom UI into CSS variables', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /function getViewportBrowserBottomOcclusion\(\)/);
  assert.match(appJs, /function isIosViewportBrowserChromeFallbackTarget\(\)/);
  assert.match(appJs, /function getViewportBrowserBottomFallback\(\)/);
  assert.match(appJs, /IOS_BROWSER_CHROME_FALLBACK_MIN/);
  assert.match(appJs, /IOS_BROWSER_CHROME_FALLBACK_MAX/);
  assert.match(appJs, /window\.visualViewport/);
  assert.match(appJs, /viewport\.offsetTop \+ viewport\.height/);
  assert.match(appJs, /Math\.ceil\(layoutHeight - visibleBottom\)/);
  assert.match(appJs, /--viewport-browser-bottom/);
  assert.match(appJs, /--viewport-browser-bottom-fallback/);
  assert.match(appJs, /window\.visualViewport\.addEventListener\("resize",\s*scheduleViewportChromeSync\)/);
  assert.match(appJs, /window\.visualViewport\.addEventListener\("scroll",\s*scheduleViewportChromeSync\)/);
  assert.match(appJs, /bindViewportChromeLifecycle\(\)/);
});

test('mobile bottom nav observes ARES nested scroll containers used by Discover', async () => {
  const appJs = await readProjectFile('web/app.js');

  assert.match(appJs, /BOTTOM_NAV_SCROLL_SOURCE_SELECTORS/);
  assert.match(appJs, /"\.results-list"/);
  assert.match(appJs, /"\.stage-wrap"/);
  assert.match(appJs, /querySelectorAll\(BOTTOM_NAV_SCROLL_SOURCE_SELECTORS\.join\(","\)\)/);
  assert.match(appJs, /Math\.max\(\s*getWindowScrollY\(\),\s*\.\.\.getBottomNavScrollContainers\(\)\.map/);
});

test('mobile bottom nav CSS uses ARIS liquid-glass shell adapted to ARES tokens', async () => {
  const [styles, designSystem, indexHtml] = await Promise.all([
    readProjectStyles(),
    readProjectFile('design/ARES Design System.html'),
    readProjectFile('web/index.html'),
  ]);

  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(styles, /--bottom-nav-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);
  assert.match(styles, /--viewport-safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
  assert.match(styles, /--viewport-safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(styles, /--viewport-browser-bottom:\s*0px/);
  assert.match(styles, /--viewport-browser-bottom-fallback:\s*0px/);
  assert.match(styles, /--viewport-bottom-occlusion:\s*max\(\s*var\(--viewport-safe-bottom\),\s*var\(--viewport-browser-bottom\),\s*var\(--viewport-browser-bottom-fallback\)\s*\)/);
  assert.match(styles, /--mobile-viewport-height:\s*100svh/);
  assert.match(styles, /@supports\s*\(height:\s*100dvh\)[\s\S]*--mobile-viewport-height:\s*100dvh/);
  assert.match(styles, /--mobile-bottom-nav-height:\s*calc\(\s*var\(--bottom-nav-shell-height\) \+ var\(--bottom-nav-offset\) \+ var\(--viewport-bottom-occlusion\) \+ var\(--bottom-nav-reserve-extra\)\s*\)/);
  assert.match(styles, /\.app-shell[\s\S]*padding-top:\s*var\(--viewport-safe-top\)/);
  assert.match(styles, /\.workspace[\s\S]*min-height:\s*calc\(var\(--mobile-viewport-height\) - var\(--viewport-safe-top\)\)/);
  assert.match(styles, /\.main-topbar[\s\S]*top:\s*var\(--viewport-safe-top\)/);
  assert.match(styles, /\.bottom-nav-hidden[\s\S]*pointer-events:\s*none/);
  assert.match(styles, /\.bottom-nav-indicator[\s\S]*cubic-bezier\(0\.175,\s*0\.885,\s*0\.32,\s*1\.275\)/);
  assert.match(styles, /width:\s*min\(400px,\s*calc\(100vw - 1rem\)\)/);
  assert.match(styles, /bottom:\s*calc\(var\(--bottom-nav-offset\) \+ var\(--viewport-bottom-occlusion\)\)/);
  assert.match(styles, /\.reading-pdf-dock-layer[\s\S]*bottom:\s*calc\(var\(--mobile-bottom-nav-height\) \+ 4px\)/);
  assert.match(styles, /\.reading-pdf-dock-layer[\s\S]*position:\s*fixed/);
  assert.match(styles, /\.reading-pdf-dock-layer[\s\S]*padding:\s*0 10px 8px/);
  assert.match(styles, /\.search-preview-focal:not\(\.is-empty\)[\s\S]*bottom:\s*var\(--viewport-bottom-occlusion\)/);
  assert.match(styles, /\.bottom-nav[\s\S]*overflow:\s*visible/);
  assert.match(styles, /\.nav-item[\s\S]*min-height:\s*54px/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.bottom-nav/);
  assert.match(designSystem, /ARIS-style floating bottom-nav/);
  assert.match(designSystem, /auto-hide on downward scroll/);
});
