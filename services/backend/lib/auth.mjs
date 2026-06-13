const PROJECT_ACTION_ROLES = {
  destructive: new Set(['owner']),
  read: new Set(['owner', 'editor', 'viewer']),
  write: new Set(['owner', 'editor']),
};

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

export function createAuthService(env = process.env) {
  const mode = normalizeMode(env.ARES_AUTH_MODE);
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
    resolveRequest,
  };
}
