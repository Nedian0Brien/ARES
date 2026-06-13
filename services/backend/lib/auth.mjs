const PROJECT_ACTION_ROLES = {
  destructive: new Set(['owner']),
  read: new Set(['owner', 'editor', 'viewer']),
  write: new Set(['owner', 'editor']),
};
const SESSION_COOKIE_NAME = 'ares_session';

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'required' || mode === 'enforced' ? 'required' : 'dev';
}

function normalizeRole(value, fallback = 'viewer') {
  const role = String(value || '').trim().toLowerCase();
  return role === 'owner' || role === 'editor' || role === 'viewer' || role === 'admin' ? role : fallback;
}

function headerValue(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 0) {
        return cookies;
      }
      cookies[decodeURIComponent(part.slice(0, separator).trim())] = decodeURIComponent(part.slice(separator + 1));
      return cookies;
    }, {});
}

function cookieHeader(name, value, { maxAgeSeconds = 0, secure = false } = {}) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure');
  }
  if (maxAgeSeconds) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join('; ');
}

function projectMembers(project) {
  const values = [];
  if (Array.isArray(project?.members)) {
    values.push(...project.members);
  }
  if (Array.isArray(project?.access)) {
    values.push(...project.access);
  }
  if (Array.isArray(project?.projectAccess)) {
    values.push(...project.projectAccess);
  }
  return values;
}

function membershipRole(user, project) {
  if (!user?.id || !project) {
    return '';
  }

  if (project.ownerId && String(project.ownerId) === user.id) {
    return 'owner';
  }

  const match = projectMembers(project).find((entry) => {
    const userId = entry?.userId || entry?.id || entry?.email;
    return userId && String(userId) === user.id;
  });

  return match ? normalizeRole(match.role, 'viewer') : '';
}

export function createAuthService(env = process.env, { store } = {}) {
  const mode = normalizeMode(env.ARES_AUTH_MODE);
  const secureCookie = env.ARES_COOKIE_SECURE === '1' || env.ARES_COOKIE_SECURE === 'true';
  const sessionTtlSeconds = Math.max(300, Number(env.ARES_SESSION_TTL_SECONDS) || 60 * 60 * 24 * 7);
  const defaultUser = {
    email: String(env.ARES_DEV_USER_EMAIL || 'dev@ares.local'),
    id: String(env.ARES_DEV_USER_ID || 'dev-user'),
    role: normalizeRole(env.ARES_DEV_USER_ROLE, 'owner'),
  };

  function resolveRequest(request) {
    const userId = String(headerValue(request.headers, 'x-ares-user-id') || '').trim();
    const email = String(headerValue(request.headers, 'x-ares-user-email') || '').trim();
    const role = normalizeRole(headerValue(request.headers, 'x-ares-user-role'), 'viewer');

    if (userId) {
      return {
        mode,
        user: {
          email,
          id: userId,
          role,
        },
      };
    }

    const sessionToken = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME];
    const session = sessionToken && store?.getAuthSessionByToken ? store.getAuthSessionByToken(sessionToken) : null;
    const sessionUser = session && store?.getUser ? store.getUser(session.userId) : null;
    if (session && sessionUser) {
      return {
        csrfToken: session.csrfToken,
        mode,
        session,
        user: sessionUser,
      };
    }

    if (mode === 'required') {
      return {
        error: 'Authentication is required.',
        mode,
        statusCode: 401,
        user: null,
      };
    }

    return {
      mode,
      user: defaultUser,
    };
  }

  function csrfError(request, authContext) {
    if (!authContext?.session || request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return null;
    }

    const token = String(headerValue(request.headers, 'x-csrf-token') || '').trim();
    return token && token === authContext.csrfToken ? null : 'CSRF token is required.';
  }

  async function createSession(userId) {
    if (!store?.createAuthSession) {
      throw new Error('Auth sessions are not supported by this store.');
    }
    const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000).toISOString();
    const session = await store.createAuthSession({
      expiresAt,
      userId,
    });
    return {
      cookie: cookieHeader(SESSION_COOKIE_NAME, session.token, {
        maxAgeSeconds: sessionTtlSeconds,
        secure: secureCookie,
      }),
      csrfToken: session.csrfToken,
      expiresAt,
      session,
    };
  }

  async function revokeRequestSession(request) {
    const sessionToken = parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME];
    if (sessionToken && store?.revokeAuthSession) {
      await store.revokeAuthSession(sessionToken);
    }
    return {
      cookie: cookieHeader(SESSION_COOKIE_NAME, '', {
        maxAgeSeconds: 1,
        secure: secureCookie,
      }),
    };
  }

  function canAccessProject(user, project, action = 'read') {
    if (!user || !project) {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    const requiredRoles = PROJECT_ACTION_ROLES[action] || PROJECT_ACTION_ROLES.read;
    const role = membershipRole(user, project);

    if (!role && mode === 'dev' && !project.ownerId && !projectMembers(project).length) {
      return true;
    }

    return requiredRoles.has(role);
  }

  return {
    defaultUser,
    mode,
    canAccessProject,
    createSession,
    csrfError,
    revokeRequestSession,
    resolveRequest,
  };
}
