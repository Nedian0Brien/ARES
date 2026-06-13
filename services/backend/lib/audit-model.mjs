import { randomUUID } from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function ensureText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value).trim();
}

function clonePayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

export function normalizeAuditEvent(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  return {
    action: ensureText(input.action, previous?.action || 'unknown'),
    actorUserId: ensureText(input.actorUserId, previous?.actorUserId || ''),
    createdAt,
    id: ensureText(input.id, previous?.id || `audit-${randomUUID()}`),
    metadata: clonePayload(input.metadata ?? previous?.metadata),
    projectId: ensureText(input.projectId, previous?.projectId || ''),
    reason: ensureText(input.reason, previous?.reason || ''),
    targetId: ensureText(input.targetId, previous?.targetId || ''),
    targetType: ensureText(input.targetType, previous?.targetType || ''),
  };
}
