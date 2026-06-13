import { defineConfig } from '@playwright/test';

const baseURL = process.env.ARES_E2E_BASE_URL || 'http://127.0.0.1:3110';
const e2eDataRoot = process.env.ARES_E2E_DATA_ROOT || '.runtime/e2e';

export default defineConfig({
  expect: {
    timeout: 7000,
  },
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.ARES_E2E_BASE_URL
    ? undefined
    : {
        command: `mkdir -p ${e2eDataRoot}/data && cp data/store.seed.json ${e2eDataRoot}/data/store.seed.json && HOST=127.0.0.1 PORT=3110 ARES_DATA_ROOT_DIR=${e2eDataRoot} ARES_ENABLE_DEMO_PDF=true node services/backend/index.mjs`,
        reuseExistingServer: !process.env.CI,
        timeout: 20000,
        url: `${baseURL}/api/health`,
      },
});
