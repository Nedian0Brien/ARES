# ARES Production Release Runbook

## Pre-Release Gates

Run `npm run release:check` before promoting a production or staging build.

The release gate runs these checks in order:

1. `npm run lint`
2. `npm test`
3. `npm run test:e2e`
4. `npm run test:postgres`
5. `npm run smoke:worker-recovery`
6. `npm run validate:reading-corpus`

`test:postgres` requires `ARES_POSTGRES_E2E_ADMIN_URL`. If that variable is absent, the PostgreSQL e2e test is skipped by the test runner and the release owner must run it in staging before promotion.

## Staging Rehearsal

1. Deploy the target commit to staging.
2. Confirm `/api/health` returns `status=ok`, the expected commit, and an `x-request-id`.
3. Run `npm run release:check` with staging secrets available.
4. Upload or parse one Reader PDF from the validation corpus.
5. Start one queued agent run and confirm `smoke:worker-recovery` still passes after restart.
6. Export one draft once Sprint 6 export gates are complete.

## Rollback

1. Stop new worker claims by removing workers or disabling the worker process.
2. Repoint the runtime symlink or service image to the last known-good commit.
3. Restart the web process and worker process.
4. Run `bash deploy/smoke-dev-web.sh` or the staging equivalent.
5. Confirm logs can be filtered by `requestId`, `userId`, `projectId`, and `runId`.

## Incident Triage

Use the response `x-request-id` first for API failures. For agent and lab failures, pivot from request logs to `runId`, then inspect the stored run progress events and the worker heartbeat or lease fields.
