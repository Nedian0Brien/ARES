const path = require('path');

function readPort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const runtimeRoot = process.env.ARES_RUNTIME_ROOT || path.join(process.cwd(), '.runtime', 'dev-web', 'current');
const port = readPort(process.env.WEB_PORT || process.env.PORT, 3100);

module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || 'ares-web-dev',
      cwd: runtimeRoot,
      script: './services/backend/index.mjs',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: '5s',
      max_restarts: 10,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        HOST: process.env.APP_HOST || process.env.HOST || '0.0.0.0',
        PORT: port,
        ARES_LIVE_RELOAD: process.env.ARES_LIVE_RELOAD || '0',
        OPENALEX_API_KEY: process.env.OPENALEX_API_KEY || '',
        OPENALEX_MAILTO: process.env.OPENALEX_MAILTO || '',
      },
    },
  ],
};
