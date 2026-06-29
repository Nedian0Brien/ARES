import { useEffect, useState } from 'react';
import {
  primeAutoHideScrollState,
  reduceAutoHideScrollState,
} from '../../app/lib/mobile-scroll-auto-hide.js';

const MOBILE_MAX_WIDTH = 900;
const IOS_BROWSER_CHROME_FALLBACK_MIN = 56;
const IOS_BROWSER_CHROME_FALLBACK_MAX = 82;
const IOS_BROWSER_CHROME_FALLBACK_RATIO = 0.096;
const AUTO_HIDE_RESUME_GUARD_MS = 240;
const BOTTOM_NAV_AUTO_HIDE_THRESHOLDS = {
  hideAfterScrollY: 72,
  hideDeltaThreshold: 8,
  nearTopThreshold: 32,
  revealDeltaThreshold: 8,
};

function isMobileViewport() {
  return window.innerWidth <= MOBILE_MAX_WIDTH;
}

function isIosViewportBrowserChromeFallbackTarget() {
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const isIosDevice = /iP(ad|hone|od)/.test(platform) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  return isMobileViewport() && isIosDevice && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent) && !isStandalone;
}

function getViewportBrowserBottomOcclusion() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }

  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || viewport.height;
  const visibleBottom = viewport.offsetTop + viewport.height;
  return Math.max(0, Math.ceil(layoutHeight - visibleBottom));
}

function getViewportBrowserBottomFallback() {
  if (!isIosViewportBrowserChromeFallbackTarget()) {
    return 0;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || window.visualViewport?.height || 0;
  return Math.round(Math.min(
    IOS_BROWSER_CHROME_FALLBACK_MAX,
    Math.max(IOS_BROWSER_CHROME_FALLBACK_MIN, viewportHeight * IOS_BROWSER_CHROME_FALLBACK_RATIO),
  ));
}

function syncViewportChromeVariables() {
  document.documentElement.style.setProperty('--viewport-browser-bottom', `${getViewportBrowserBottomOcclusion()}px`);
  document.documentElement.style.setProperty('--viewport-browser-bottom-fallback', `${getViewportBrowserBottomFallback()}px`);
}

function useVisualViewportOcclusion() {
  useEffect(() => {
    let frame = 0;
    const scheduleSync = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncViewportChromeVariables();
      });
    };

    syncViewportChromeVariables();
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    document.addEventListener('visibilitychange', scheduleSync);
    window.visualViewport?.addEventListener('resize', scheduleSync);
    window.visualViewport?.addEventListener('scroll', scheduleSync);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      window.removeEventListener('pageshow', scheduleSync);
      document.removeEventListener('visibilitychange', scheduleSync);
      window.visualViewport?.removeEventListener('resize', scheduleSync);
      window.visualViewport?.removeEventListener('scroll', scheduleSync);
    };
  }, []);
}

function useMobileAutoHide(scrollTarget = window) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let state = primeAutoHideScrollState({
      currentY: scrollTarget.scrollY || scrollTarget.scrollTop || 0,
      now: performance.now(),
      resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
    });
    const onScroll = () => {
      state = reduceAutoHideScrollState({
        currentY: scrollTarget.scrollY || scrollTarget.scrollTop || 0,
        isMobile: isMobileViewport(),
        now: performance.now(),
        state,
        thresholds: BOTTOM_NAV_AUTO_HIDE_THRESHOLDS,
      });
      setHidden(state.hidden);
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrollTarget]);

  return hidden;
}

export { getViewportBrowserBottomFallback, getViewportBrowserBottomOcclusion, syncViewportChromeVariables, useMobileAutoHide, useVisualViewportOcclusion };
