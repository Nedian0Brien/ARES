import { randomUUID } from 'node:crypto';

const VALID_ROLES = new Set(['owner', 'editor', 'viewer', 'admin']);

function nowIso() {
  return new Date().toISOString();
}

function ensureText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value).trim();
}

function ensureRole(value, fallback = 'viewer') {
  const role = ensureText(value).toLowerCase();
  return VALID_ROLES.has(role) ? role : fallback;
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function normalizeUser(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  const id = ensureText(input.id || input.userId, previous?.id || createId('user'));
  const email = ensureText(input.email, previous?.email || '');
  return {
    createdAt,
    email,
    id,
    name: ensureText(input.name, previous?.name || email || id),
    role: ensureRole(input.role, previous?.role || 'viewer'),
    status: ensureText(input.status, previous?.status || 'active').toLowerCase(),
    updatedAt: nowIso(),
  };
}

export function normalizeOrganization(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  return {
    createdAt,
    id: ensureText(input.id || input.organizationId, previous?.id || createId('org')),
    name: ensureText(input.name, previous?.name || 'Untitled organization'),
    slug: ensureText(input.slug, previous?.slug || ''),
    status: ensureText(input.status, previous?.status || 'active').toLowerCase(),
    updatedAt: nowIso(),
  };
}

export function normalizeMembership(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  return {
    createdAt,
    id: ensureText(input.id, previous?.id || createId('membership')),
    organizationId: ensureText(input.organizationId, previous?.organizationId || ''),
    role: ensureRole(input.role, previous?.role || 'viewer'),
    status: ensureText(input.status, previous?.status || 'active').toLowerCase(),
    updatedAt: nowIso(),
    userId: ensureText(input.userId, previous?.userId || ''),
  };
}

export function normalizeProjectAccess(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  return {
    createdAt,
    id: ensureText(input.id, previous?.id || createId('project-access')),
    projectId: ensureText(input.projectId, previous?.projectId || ''),
    role: ensureRole(input.role, previous?.role || 'viewer'),
    status: ensureText(input.status, previous?.status || 'active').toLowerCase(),
    updatedAt: nowIso(),
    userId: ensureText(input.userId, previous?.userId || ''),
  };
}

export function normalizeAuthSession(input = {}, previous = null) {
  const createdAt = ensureText(input.createdAt, previous?.createdAt || nowIso());
  return {
    createdAt,
    csrfToken: ensureText(input.csrfToken, previous?.csrfToken || createId('csrf')),
    expiresAt: ensureText(input.expiresAt, previous?.expiresAt || ''),
    id: ensureText(input.id, previous?.id || createId('session')),
    lastSeenAt: ensureText(input.lastSeenAt, previous?.lastSeenAt || createdAt),
    revokedAt: ensureText(input.revokedAt, previous?.revokedAt || ''),
    token: ensureText(input.token, previous?.token || createId('token')),
    updatedAt: nowIso(),
    userId: ensureText(input.userId, previous?.userId || ''),
  };
}
