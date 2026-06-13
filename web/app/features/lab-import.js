const METRIC_LINE_PATTERN = /^\s*([a-zA-Z][\w ./%-]{0,60})\s*[:=]\s*([-+]?\d+(?:\.\d+)?%?)\s*$/;
const FAILURE_PATTERN = /\b(error|failed|failure|exception|traceback|runtimeerror|out of memory|oom)\b/i;
const SUCCESS_PATTERN = /\b(done|completed|success|passed|finished)\b/i;

function cleanLabel(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function normaliseMetricName(value) {
  return cleanLabel(value, "primary").toLowerCase().replace(/\s+/g, "_");
}

function parseMetrics(log) {
  const metrics = {};
  for (const line of String(log || "").split(/\r?\n/)) {
    const match = line.match(METRIC_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const name = normaliseMetricName(match[1]);
    if (!metrics[name]) {
      metrics[name] = match[2];
    }
  }
  return metrics;
}

function parseArtifacts({ artifactLabel, artifactUrl }) {
  const url = cleanLabel(artifactUrl);
  if (!url) {
    return [];
  }

  return [
    {
      label: cleanLabel(artifactLabel, "External artifact"),
      type: "external",
      url,
    },
  ];
}

export function parseLabImportPayload({ artifactLabel = "", artifactUrl = "", command = "", log = "" } = {}) {
  const rawLog = String(log || "").trim();
  const metrics = parseMetrics(rawLog);
  const metricName = Object.keys(metrics)[0] || "primary";
  const observedMetric = metrics[metricName] || "";
  if (observedMetric) {
    metrics.primary = observedMetric;
  }

  return {
    artifacts: parseArtifacts({ artifactLabel, artifactUrl }),
    config: {
      command: cleanLabel(command),
      importSource: "external-paste",
      rawLog,
    },
    metricName,
    metrics,
    observedMetric,
    status: FAILURE_PATTERN.test(rawLog) ? "error" : SUCCESS_PATTERN.test(rawLog) ? "done" : "queue",
  };
}
