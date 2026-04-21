const PROXY_PATH_PREFIX = /^\/proxy\/\d+(?=\/|$)/;

export function normalizeRequestPath(requestPath) {
  const normalized = String(requestPath || '/').replace(PROXY_PATH_PREFIX, '') || '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
