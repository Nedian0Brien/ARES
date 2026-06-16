export const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function contentTypeForPath(filePath, fallback = 'application/octet-stream') {
  const extension = String(filePath || '').match(/\.[^.]*$/)?.[0] || '';
  return CONTENT_TYPES[extension] || fallback;
}
