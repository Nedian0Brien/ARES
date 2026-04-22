# ARES Backend Context

Updated: 2026-04-22

## Identity

- Project: `ARES`
- Backend root: `services/backend`
- Frontend root: `web`
- Runtime entrypoint: `services/backend/index.mjs`
- Package runtime: Node ESM

## Current Backend Shape

- Single-process Node HTTP server
- No Express or Fastify
- Static file serving for `web/`
- API routing handled manually in `index.mjs`
- Dev live reload handled with SSE

## Core Modules

- `services/backend/index.mjs`
  - bootstraps env, store, search service, agent run service
- `services/backend/lib/agent-runtime.mjs`
  - wraps `codex exec --json`
  - parses JSONL runtime events
- `services/backend/lib/agent-runs.mjs`
  - stage/task orchestration
  - capability profiles
  - fallback asset generation
- `services/backend/lib/scout-search.mjs`
  - Scout search runtime
  - fallback chain: Scout -> OpenAlex -> seed
- `services/backend/lib/store.mjs`
  - backend selector
- `services/backend/lib/file-store.mjs`
  - file-backed runtime store
- `services/backend/lib/postgres-store.mjs`
  - PostgreSQL-backed runtime store

## Storage Rules

- Preferred future backend: PostgreSQL
- Current fallback backend: file store
- Store selection logic:
  - explicit `ARES_STORE_BACKEND=postgres|postgresql|pg` -> postgres
  - explicit `ARES_STORE_BACKEND=file|json` -> file
  - otherwise if `ARES_DATABASE_URL` or `DATABASE_URL` exists -> postgres
  - otherwise -> file

## File Store Facts

- Seed file: `data/store.seed.json`
- Runtime file: `data/runtime/store.json`
- Model:
  - load JSON into memory on boot
  - mutate in memory
  - rewrite runtime snapshot on each persist

## PostgreSQL Store Facts

- Client library: `pg`
- Pool-based connections
- Auto-creates schema
- Bootstraps from runtime JSON first, then seed JSON if DB is empty
- Main tables:
  - `ares_projects`
  - `ares_library`
  - `ares_reading_queue`
  - `ares_reading_sessions`
  - `ares_agent_runs`
  - `ares_project_assets`

## Asset Model

- `projects`
- `library`
- `readingQueue`
- `agentRuns`
- `readingSessions`
- `reproChecklistItems`
- `experimentRuns`
- `resultComparisons`
- `insightNotes`
- `writingDrafts`

ARES treats research assets as the primary system of record, not chat sessions.

## Agent Runtime Facts

- Scout runtime uses `codex exec --json`
- Runtime parser handles:
  - `thread.started`
  - `item.completed.agent_message`
  - `item.completed.command_execution`
- AgentRun status lifecycle:
  - `queue`
  - `running`
  - `done`
- Abort handles live only in process memory

## Capability Profiles

- `scout`
  - read-only retrieval
- `reader`
  - read-heavy, no shell
- `research`
  - workspace-write + shell
- `analyst`
  - read-only analysis
- `writing`
  - drafting, no shell

## Public API Surface

- `GET /api/health`
- `GET /api/projects`
- `GET /api/search`
- `POST /api/search`
- `GET /api/library`
- `POST /api/agent-runs`
- `GET /api/agent-runs`
- `GET /api/agent-runs/:runId`
- `POST /api/agent-runs/:runId/actions`
- `GET /api/projects/:projectId/reading-sessions`
- `POST /api/projects/:projectId/reading-sessions`
- `GET /api/projects/:projectId/repro-checklist`
- `GET /api/projects/:projectId/experiment-runs`
- `GET /api/projects/:projectId/result-comparisons`
- `GET /api/projects/:projectId/insight-notes`
- `GET /api/projects/:projectId/writing-drafts`

## Health Contract

`GET /api/health` currently returns:

- `ok`
- `codexAvailable`
- `providerConfigured`
- `profiles`
- `profileDetails`
- `storage`

## Env Snapshot

- `HOST`
- `PORT`
- `OPENALEX_API_KEY`
- `OPENALEX_MAILTO`
- `ARES_STORE_BACKEND`
- `ARES_DATABASE_URL`
- `ARES_DATABASE_SSL`
- `SCOUT_AGENT_RUNTIME`
- `ARES_AGENT_RUNTIME`
- `SCOUT_AGENT_TIMEOUT_MS`
- `ARES_LIVE_RELOAD`

## Scripts

- `npm start` -> `node services/backend/index.mjs`
- `npm run dev` -> `node --watch services/backend/index.mjs`
- `npm test` -> `node --test services/backend/tests/*.test.mjs`

## Deploy Facts

- PM2 entry script: `services/backend/index.mjs`
- Dev deploy script: `deploy/deploy-dev-web.sh`
- Validation step includes:
  - `node --check services/backend/index.mjs`
  - `node --check web/app.js`
  - `npm test`

## Current Constraints

- Single Node process
- No separate worker yet
- Agent subprocess state not durable across process restart
- PostgreSQL exists in code but infra rollout is not fully automated
- No auth / user isolation yet

## Immediate Recommendation

- Treat PostgreSQL as the intended production backend
- Keep file store as local bootstrap fallback
- Next structural step should be splitting AgentRun execution into a worker
