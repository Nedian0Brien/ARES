# Object Storage Provider Decision

ARES artifact storage uses an S3-compatible adapter boundary.

## Decision

- Primary production target: S3-compatible object storage.
- Local development target: filesystem-backed `LocalArtifactStore`.
- Runtime contract: `readFile`, `readJson`, `readText`, `writeBinary`, `writeJson`, `writeText`, `exists`, and optional `getSignedUrl`.

## Why

- S3-compatible APIs keep deployment portable across AWS S3, Cloudflare R2, MinIO, and similar providers.
- The adapter keeps Reader PDF, thumbnail, table, and export artifacts away from direct route/service filesystem assumptions.
- Signed URL support lets production serve large artifacts without making the Node backend stream every byte.

## Current Implementation

- Local adapter: `services/backend/lib/artifact-store.mjs`
- S3-compatible adapter: `services/backend/lib/artifact-store.mjs`
- Mock verification: `services/backend/tests/artifact-store.test.mjs`
