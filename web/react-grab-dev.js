const REACT_GRAB_SRC = "https://unpkg.com/react-grab/dist/index.global.js";
const REACT_GRAB_QUERY_KEY = "grab";
const LOCAL_GRAB_HOSTS = new Set(["127.0.0.1", "localhost"]);

function readGrabPreference() {
  const params = new URLSearchParams(window.location.search);
  const grabParam = params.get(REACT_GRAB_QUERY_KEY);

  if (grabParam === "0" || grabParam === "false" || grabParam === "off") {
    return false;
  }

  if (grabParam === "1" || grabParam === "true" || grabParam === "on") {
    return true;
  }

  return LOCAL_GRAB_HOSTS.has(window.location.hostname);
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-react-grab-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true" || window.__REACT_GRAB__) {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.reactGrabSrc = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

function getAresRoot() {
  return document.querySelector("[data-ares-app='true']");
}

function collectSurfaceChain(element) {
  const chain = [];
  const seen = new Set();

  for (let node = element; node; node = node.parentElement) {
    const surface = node.dataset?.aresSurface || node.dataset?.aresRole;
    if (surface && !seen.has(surface)) {
      chain.unshift(surface);
      seen.add(surface);
    }

    if (node.dataset?.aresApp === "true") {
      break;
    }
  }

  return chain;
}

function describeElement(element) {
  if (!element) {
    return "";
  }

  const details = [element.tagName?.toLowerCase()].filter(Boolean);
  const surface = element.closest("[data-ares-surface]")?.dataset?.aresSurface;
  const role = element.closest("[data-ares-role]")?.dataset?.aresRole;
  const paperTitle = element.closest("[data-ares-paper-title]")?.dataset?.aresPaperTitle;

  if (surface) {
    details.push(`surface="${surface}"`);
  }

  if (role && role !== surface) {
    details.push(`role="${role}"`);
  }

  if (paperTitle) {
    details.push(`paper="${paperTitle}"`);
  }

  return details.join(" · ");
}

function buildContextHeader(elements) {
  const root = getAresRoot();
  const element = Array.isArray(elements) ? elements.find(Boolean) || null : null;
  const surfaceChain = collectSurfaceChain(element);
  const lines = [
    "ARES UI context",
    `- URL: ${window.location.pathname}${window.location.search}${window.location.hash}`,
    `- Stage: ${root?.dataset?.activeStage || "unknown"}`,
    `- Project: ${root?.dataset?.activeProjectName || "unknown"}`,
  ];

  if (root?.dataset?.activePaperTitle) {
    lines.push(`- Selected paper: ${root.dataset.activePaperTitle}`);
  }

  if (surfaceChain.length) {
    lines.push(`- Surface path: ${surfaceChain.join(" > ")}`);
  }

  if (element) {
    lines.push(`- Target: ${describeElement(element)}`);
  }

  return lines.join("\n");
}

function buildPlugin() {
  return {
    name: "ares-context",
    theme: {
      hue: 232,
    },
    hooks: {
      transformCopyContent(content, elements) {
        const header = buildContextHeader(elements);
        return `${header}\n\n${content}`;
      },
      onCopySuccess(elements) {
        const count = Array.isArray(elements) ? elements.length : 0;
        document.documentElement.dataset.reactGrabStatus = count > 1 ? "copied-multi" : "copied";
      },
      onCopyError(error) {
        document.documentElement.dataset.reactGrabStatus = "error";
        console.warn("[ARES] React Grab copy failed:", error);
      },
    },
  };
}

function configureReactGrab(api) {
  if (typeof api?.setOptions === "function") {
    api.setOptions({
      allowActivationInsideInput: false,
      freezeReactUpdates: false,
    });
  }

  const plugins = typeof api?.getPlugins === "function" ? api.getPlugins() : [];
  if (!plugins.includes("ares-context")) {
    api.registerPlugin(buildPlugin());
  }

  document.documentElement.dataset.reactGrabStatus = "ready";
}

function whenReactGrabReady(callback) {
  if (window.__REACT_GRAB__) {
    callback(window.__REACT_GRAB__);
    return;
  }

  window.addEventListener(
    "react-grab:init",
    (event) => {
      callback(event.detail);
    },
    { once: true },
  );
}

async function bootReactGrab() {
  if (!readGrabPreference()) {
    window.__REACT_GRAB_DISABLED__ = true;
    document.documentElement.dataset.reactGrabStatus = "disabled";
    return;
  }

  document.documentElement.dataset.reactGrabStatus = "loading";

  try {
    await injectScript(REACT_GRAB_SRC);
    whenReactGrabReady(configureReactGrab);
  } catch (error) {
    document.documentElement.dataset.reactGrabStatus = "error";
    console.warn("[ARES] React Grab failed to load:", error);
  }
}

bootReactGrab();
