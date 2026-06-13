# iOS Safari Viewport Handling

## Problem

iOS Safari can show a bottom browser toolbar over the page. In that state, `env(safe-area-inset-bottom)` may still describe only the hardware safe area, while the actual visible viewport is shorter. A fixed bottom UI can therefore sit behind Safari's browser toolbar and look clipped.

In ARES this affects bottom-fixed or bottom-anchored surfaces:

- mobile workflow bottom nav
- search preview bottom sheet
- reading PDF dock
- reading home preview modal

## Implementation Contract

ARES treats hardware safe area and Safari browser chrome as separate values.

- `--viewport-safe-bottom`: hardware safe area from `env(safe-area-inset-bottom)`
- `--viewport-browser-bottom`: runtime browser chrome overlap, written by JavaScript
- `--viewport-browser-bottom-fallback`: conservative iOS Safari browser-toolbar reserve
- `--viewport-bottom-occlusion`: `max(safe area, browser chrome overlap, iOS Safari fallback)`

The runtime value is calculated in `web/app.js` from `window.visualViewport`:

```text
bottom occlusion = window.innerHeight - (visualViewport.offsetTop + visualViewport.height)
```

If `visualViewport` is unavailable, the runtime browser overlap is `0px`, and the layout falls back to the hardware safe-area value.

On iOS Safari, the bottom browser toolbar can still visually cover fixed bottom UI even when the browser reports little or no `visualViewport` delta. ARES therefore adds a conservative mobile Safari fallback reserve of roughly one toolbar height. This mirrors the safer portfolio pattern: do not trust `env(safe-area-inset-bottom)` alone for interactive bottom-fixed controls.

## CSS Rules

Any mobile UI anchored to the bottom of the viewport must use `--viewport-bottom-occlusion`, not `env(safe-area-inset-bottom)` directly.

Use:

```css
bottom: calc(var(--bottom-nav-offset) + var(--viewport-bottom-occlusion));
padding-bottom: calc(16px + var(--viewport-bottom-occlusion));
```

Avoid:

```css
bottom: env(safe-area-inset-bottom);
bottom: 0;
padding-bottom: env(safe-area-inset-bottom);
```

For scrollable mobile screens, reserve enough bottom space through `--mobile-bottom-nav-height` so the last content cannot disappear behind the floating nav or Safari toolbar.

## Verification

Regression coverage lives in `services/backend/tests/mobile-bottom-nav-aris-parity.test.mjs`.

Manual or browser verification should check:

1. `meta[name="viewport"]` includes `viewport-fit=cover`.
2. `--viewport-browser-bottom` updates when `visualViewport` resizes or scrolls.
3. `--viewport-browser-bottom-fallback` becomes non-zero on iOS Safari mobile browser sessions.
4. `.bottom-nav`, `.search-preview-focal`, and `.reading-pdf-dock-layer` use `--viewport-bottom-occlusion`.
5. The bottom nav remains above the visible viewport bottom on iOS Safari with the bottom toolbar visible.

Playwright mobile emulation is useful for bounds checks, but it does not reproduce iOS Safari's real bottom toolbar. Treat real-device Safari confirmation as the final source of truth for this issue.
