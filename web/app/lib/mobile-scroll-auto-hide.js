export function primeAutoHideScrollState({ currentY, now, resumeGuardMs }) {
  return {
    hidden: false,
    lastScrollY: currentY,
    resumeGuardUntil: now + Math.max(0, resumeGuardMs),
  };
}

export function reduceAutoHideScrollState({
  state,
  currentY,
  now,
  isMobile,
  thresholds,
  isSessionScrollActive = false,
  sessionScrollPhase = "",
}) {
  if (!isMobile) {
    return {
      hidden: false,
      lastScrollY: currentY,
      resumeGuardUntil: 0,
    };
  }

  const forceVisiblePhases = new Set(["resuming", "viewport-reflow", "restoring-tail", "loading-older"]);
  if (isSessionScrollActive && forceVisiblePhases.has(sessionScrollPhase)) {
    return {
      hidden: false,
      lastScrollY: currentY,
      resumeGuardUntil: state.resumeGuardUntil,
    };
  }

  if (now < state.resumeGuardUntil) {
    return {
      ...state,
      hidden: false,
      lastScrollY: currentY,
    };
  }

  const delta = currentY - state.lastScrollY;
  let hidden = state.hidden;

  if (currentY < thresholds.nearTopThreshold) {
    hidden = false;
  } else if (delta > thresholds.hideDeltaThreshold && currentY > thresholds.hideAfterScrollY) {
    hidden = true;
  } else if (delta < -thresholds.revealDeltaThreshold) {
    hidden = false;
  }

  return {
    hidden,
    lastScrollY: currentY,
    resumeGuardUntil: state.resumeGuardUntil,
  };
}
