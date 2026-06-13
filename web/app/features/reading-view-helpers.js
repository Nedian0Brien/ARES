export function createReadingViewHelpers({ TOKENS }) {
  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readingText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function readingExcerpt(value, fallback = "", limit = 220) {
    const text = readingText(value, fallback).replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }

    if (text.length <= limit) {
      return text;
    }

    return `${text.slice(0, limit - 1).trimEnd()}…`;
  }

  function readingSentence(value, fallback = "") {
    const text = readingText(value, fallback).replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }

    const match = text.match(/^(.{0,240}?[.!?])(?:\s|$)/);
    return match ? match[1] : text;
  }

  function readingCategoryMeta(type) {
    const key = String(type || "note").trim().toLowerCase();
    return {
      claim: { label: "Claim", color: TOKENS.research },
      method: { label: "Method", color: TOKENS.read },
      result: { label: "Result", color: TOKENS.search },
      limit: { label: "Limit", color: TOKENS.result },
      note: { label: "Note", color: TOKENS.writing },
      summary: { label: "Summary", color: TOKENS.read },
    }[key] || { label: "Note", color: TOKENS.writing };
  }

  function readingSectionPage(index) {
    return Math.max(1, index + 1);
  }

  function readingMatchSectionIndex(sections = [], value = "") {
    const lowered = String(value || "").trim().toLowerCase();
    if (!lowered) {
      return -1;
    }

    return sections.findIndex((section) => {
      const id = String(section.id || "").toLowerCase();
      const label = String(section.label || "").toLowerCase();
      return id === lowered || label === lowered || label.includes(lowered) || lowered.includes(id);
    });
  }

  return {
    clampValue,
    readingCategoryMeta,
    readingExcerpt,
    readingMatchSectionIndex,
    readingSectionPage,
    readingSentence,
    readingText,
  };
}
