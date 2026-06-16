import { randomUUID } from 'node:crypto';

import { ASSET_COLLECTIONS } from './asset-model.mjs';
import { normalizeAuditEvent } from './audit-model.mjs';
import {
  normalizeAuthSession,
  normalizeMembership,
  normalizeOrganization,
  normalizeProjectAccess,
  normalizeUser,
} from './identity-model.mjs';

export const PROJECT_MAP_COLLECTIONS = ['library', 'readingQueue'];
export const IDENTITY_COLLECTIONS = ['users', 'organizations', 'memberships', 'projectAccess', 'authSessions'];
export const AUDIT_COLLECTIONS = ['auditEvents'];
export const RUNNING_STATUSES = new Set(['queue', 'running']);
export const VALID_STATUSES = new Set(['todo', 'queue', 'running', 'done', 'error', 'canceled']);
export const MAX_AGENT_PROGRESS_EVENTS = 80;

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArrayMap(state, key) {
  if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) {
    state[key] = {};
    return true;
  }

  return false;
}

export function migrateStoreState(inputState, { normalizeIdentity = false } = {}) {
  let changed = false;
  let state = inputState;

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    state = {};
    changed = true;
  }

  if (!Array.isArray(state.projects)) {
    state.projects = [];
    changed = true;
  }

  for (const key of IDENTITY_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }
  for (const key of AUDIT_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }

  if (normalizeIdentity) {
    state.users = state.users.map((entry) => normalizeUser(entry));
    state.organizations = state.organizations.map((entry) => normalizeOrganization(entry));
    state.memberships = state.memberships.map((entry) => normalizeMembership(entry));
    state.projectAccess = state.projectAccess.map((entry) => normalizeProjectAccess(entry));
    state.authSessions = state.authSessions.map((entry) => normalizeAuthSession(entry));
    state.auditEvents = state.auditEvents.map((entry) => normalizeAuditEvent(entry));
  }

  for (const key of PROJECT_MAP_COLLECTIONS) {
    changed = ensureArrayMap(state, key) || changed;
  }

  for (const key of ASSET_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
      changed = true;
    }
  }

  for (const project of state.projects) {
    for (const key of PROJECT_MAP_COLLECTIONS) {
      if (!Array.isArray(state[key][project.id])) {
        state[key][project.id] = [];
        changed = true;
      }
    }
  }

  return { changed, state };
}

export function normaliseStatus(status, fallback = 'todo') {
  const value = String(status || '').trim().toLowerCase();
  return VALID_STATUSES.has(value) ? value : fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function sortByUpdatedDesc(left, right) {
  const leftStamp = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
  const rightStamp = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
  return rightStamp - leftStamp;
}

export function sortByCreatedAsc(left, right) {
  const leftStamp = Date.parse(left.createdAt || left.updatedAt || 0) || 0;
  const rightStamp = Date.parse(right.createdAt || right.updatedAt || 0) || 0;
  return leftStamp - rightStamp;
}

export function normaliseTimestamp(value, fallback = nowIso()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  const stamp = date.getTime();
  return Number.isFinite(stamp) ? date.toISOString() : fallback;
}

export function claimExpiresAt(now, leaseMs) {
  const duration = Number.isFinite(Number(leaseMs)) && Number(leaseMs) > 0 ? Number(leaseMs) : 60_000;
  return new Date(Date.parse(now) + duration).toISOString();
}

export function ensureText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

export function isLeaseExpired(run, now) {
  if (!ensureText(run.leaseOwner)) {
    return true;
  }
  const expiresAt = Date.parse(run.leaseExpiresAt || '');
  return !Number.isFinite(expiresAt) || expiresAt <= Date.parse(now);
}

export function removeAssetId(values, id) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => value !== id);
}

export function ensureStringArray(values, limit) {
  const next = Array.isArray(values) ? values.map((value) => String(value)).filter(Boolean) : [];
  return typeof limit === 'number' ? next.slice(0, limit) : next;
}

export function ensureObjectArray(values) {
  return Array.isArray(values) ? clone(values) : [];
}

export function ensureProgressEvents(values) {
  return ensureObjectArray(values).slice(-MAX_AGENT_PROGRESS_EVENTS);
}

export function cloneMaybe(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return clone(value);
}

export function upsertBy(collection, nextValue, matcher) {
  const index = collection.findIndex((entry) => matcher(entry));

  if (index >= 0) {
    collection[index] = { ...collection[index], ...clone(nextValue) };
    return collection[index];
  }

  const inserted = clone(nextValue);
  collection.unshift(inserted);
  return inserted;
}
