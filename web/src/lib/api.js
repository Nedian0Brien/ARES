const LOCAL_GRAB_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PROXY_DEV_PATH_PATTERN = /^\/proxy\/\d+(?:\/|$)/;
const MAX_READING_PDF_UPLOAD_LABEL = '100MB';

let csrfToken = '';

function resolveAppBaseUrl(locationLike = window.location) {
  const current = new URL(locationLike.href);
  const proxyPath = current.pathname.match(PROXY_DEV_PATH_PATTERN)?.[0];

  if (proxyPath) {
    const normalizedProxyPath = proxyPath.endsWith('/') ? proxyPath : `${proxyPath}/`;
    return new URL(normalizedProxyPath, current.origin);
  }

  if (current.pathname.endsWith('/index.html')) {
    const basePath = current.pathname.replace(/index\.html$/, '') || '/';
    return new URL(basePath, current.origin);
  }

  const hasFileExtension = /\.[a-z0-9]+$/i.test(current.pathname);
  if (
    LOCAL_GRAB_HOSTS.has(current.hostname) &&
    current.pathname !== '/' &&
    !current.pathname.endsWith('/') &&
    !hasFileExtension
  ) {
    return new URL(`${current.pathname}/`, current.origin);
  }

  return new URL('./', current);
}

const APP_BASE_URL = resolveAppBaseUrl();

function appUrl(path) {
  return new URL(String(path || '').replace(/^\/+/, ''), APP_BASE_URL);
}

function setCsrfToken(nextToken) {
  csrfToken = String(nextToken || '');
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && options.body instanceof Blob;
  const isBinary =
    isBlob ||
    options.body instanceof ArrayBuffer ||
    (ArrayBuffer.isView(options.body) && !(options.body instanceof DataView));
  const body = options.body && typeof options.body !== 'string' && !isFormData && !isBinary
    ? JSON.stringify(options.body)
    : options.body;
  const headers = {
    ...(isFormData || isBinary ? {} : { 'content-type': 'application/json' }),
    ...(csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'x-csrf-token': csrfToken } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(appUrl(path), {
    credentials: 'same-origin',
    ...options,
    body,
    headers,
    method,
  });

  if (!response.ok) {
    const payload = await parseResponse(response).catch(() => ({}));
    if (response.status === 413) {
      throw new Error(`Upload a PDF up to ${MAX_READING_PDF_UPLOAD_LABEL}.`);
    }
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return parseResponse(response);
}

export { api, appUrl, resolveAppBaseUrl, setCsrfToken };
