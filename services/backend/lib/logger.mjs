function normalizeLevel(level) {
  const value = String(level || '').trim().toLowerCase();
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : 'info';
}

function normalizeBindings(bindings) {
  return bindings && typeof bindings === 'object' && !Array.isArray(bindings) ? bindings : {};
}

function writeLog(sink, level, message, bindings, fields) {
  const payload = {
    ...bindings,
    ...normalizeBindings(fields),
    level: normalizeLevel(level),
    message: String(message || ''),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);

  if (payload.level === 'error' && typeof sink.error === 'function') {
    sink.error(line);
    return payload;
  }

  if (payload.level === 'warn' && typeof sink.warn === 'function') {
    sink.warn(line);
    return payload;
  }

  if (typeof sink.log === 'function') {
    sink.log(line);
  }
  return payload;
}

export function createLogger({ bindings = {}, sink = console } = {}) {
  const baseBindings = normalizeBindings(bindings);

  return {
    child(nextBindings = {}) {
      return createLogger({
        bindings: {
          ...baseBindings,
          ...normalizeBindings(nextBindings),
        },
        sink,
      });
    },

    debug(message, fields = {}) {
      return writeLog(sink, 'debug', message, baseBindings, fields);
    },

    error(message, fields = {}) {
      return writeLog(sink, 'error', message, baseBindings, fields);
    },

    info(message, fields = {}) {
      return writeLog(sink, 'info', message, baseBindings, fields);
    },

    warn(message, fields = {}) {
      return writeLog(sink, 'warn', message, baseBindings, fields);
    },
  };
}
