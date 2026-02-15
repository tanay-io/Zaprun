# Project Context: Zapier (Local)

## Overview
This is a local, TypeScript + Express service that implements a simplified Zapier-like automation engine. It accepts webhook triggers, creates ZapRun records, enqueues execution steps via an outbox pattern, and processes those steps through a Kafka-backed worker. The system persists execution state with Prisma/Postgres and supports retries, step output storage, and delayed execution (system wait).

## Key Concepts
- **Zap**: A user-defined automation with a trigger and ordered actions.
- **ZapRun**: A single execution of a Zap, created on webhook trigger.
- **Outbox**: Durable queue of step executions (ZapRunOutbox). Workers claim, process, and complete jobs.
- **Executors**: Implement concrete action execution (HTTP executor included).
- **Workers**: Kafka consumer for outbox jobs + timer worker for delayed jobs.

## Runtime Components
- **API server**: Express app that exposes `/health` and webhook trigger route.
- **Kafka producer/consumer**: Publishes outbox IDs and consumes them for execution.
- **Timer worker**: Polls for due outbox jobs with `resumeAt` and republishes them.
- **Prisma + Postgres**: Persistence for users, zaps, runs, step state, and outbox.

## Environment Variables
- `DATABASE_URL`: Postgres connection string used by Prisma.
- `KAFKA_BROKERS`: Comma-separated Kafka broker list (default `localhost:9092`).
- `OUTBOX_TOPIC`: Kafka topic name (default `zaprun-outbox`).

## Project Layout (File-by-File)

### Root
- `README.md`: Basic dev/run instructions.
- `package.json`: Scripts and dependencies for server + workers.
- `tsconfig.json`: TypeScript configuration.
- `.env`: Local environment variables (contains `DATABASE_URL`).
- `new.sql`: Adds an index for outbox sweeper.
- `phase5.txt`: Notes about Phase 5 goals (outbox, retries, durability).
- `postman/*.json`: Postman collections for health check and wiring tests.

### `src/server.ts`
- Boots the API server on port `3000`.
- Initializes Kafka producer before starting Express.

### `src/api/app.ts`
- Express app configuration.
- Routes:
  - `GET /health`: Returns `{ ok: true }`.
  - Uses `webhookRouter` for webhook endpoints.

### `src/api/routes/webhook.ts`
- `POST /webhook/:zapId`
  - Loads Zap by ID (must be `active`).
  - Creates a `ZapRun` (status `pending`).
  - Creates a `ZapRunOutbox` record with `stepIndex = 0`.
  - Publishes the outbox ID to Kafka.
  - Returns `{ success, zapRunId, outboxId }`.

### `src/db/prisma.ts`
- Initializes Prisma with the Postgres adapter and pool.
- Requires `DATABASE_URL`.

### `src/engines/handleOutboxJob.ts`
- Core worker logic to process a single outbox job:
  - Claims the job with a lease (lock).
  - Loads ZapRun and action metadata.
  - Handles special `system.wait` action.
  - Resolves executor, interpolates config, executes step.
  - Writes `StepState` on success/error.
  - Enqueues next step or finalizes ZapRun status.
  - Retries on retriable errors (max 3 attempts).

### `src/engines/systemWait.ts`
- Implements delayed execution by creating a new outbox row with `resumeAt`.

### `src/executors/index.ts`
- Executor registry mapping action keys to implementations.

### `src/executors/http.executor.ts`
- Executes HTTP requests based on step config (`method`, `url`, `headers`, `body`).
- Distinguishes success (2xx), client error (4xx), server error (5xx), and network errors.
- Returns structured status, error, and meta timing info.

### `src/executors/types.ts`
- Shared executor types: `ExecutorContext`, `ExecutionResult`, etc.

### `src/kafka/producer.ts`
- Kafka producer utilities.
- Ensures topic exists, publishes outbox IDs.

### `src/kafka/consumer.ts`
- Kafka consumer that reads outbox IDs and calls `handleOutboxJob`.

### `src/outbox/claim.ts`
- Claims pending outbox jobs with a time-based lease.

### `src/outbox/complete.ts`
- Marks a processing outbox job as `completed`.

### `src/outbox/fail.ts`
- Marks a processing outbox job as `failed`.

### `src/outbox/enqueue.ts`
- Creates the next outbox record for the following step.

### `src/utils/interpolate.ts`
- Interpolates `{{trigger.xxx}}` and `{{steps.xxx}}` references in configs.
- Works for strings, arrays, and objects.

### `src/workers/consumer.worker.ts`
- Worker entrypoint for Kafka consumer + timer worker.

### `src/workers/timer.worker.ts`
- Polls for due outbox jobs (`resumeAt <= now`) and republishes them.

### Prisma
- `prisma/schema.prisma`:
  - Core models: `User`, `Zap`, `ZapVersion`, `ZapVersionStep`, `ZapTrigger`, `ZapAction`, `ZapRun`, `ZapRunOutbox`, `StepState`.
  - Enums: `ZapStatus`, `ZapRunStatus`, `OutboxStatus`, `StepExecutionStatus`.
- `prisma/seed.js`:
  - Seeds a demo user, zap, trigger, and three HTTP actions.
  - Seeds a pending `ZapRun` for testing.
- `prisma/seed-runner.js`:
  - Placeholder (prints `Seed skipped`).
- `prisma/migrations/*`:
  - Database migrations for schema evolution.

### Postman Collections
- `postman/zapier-ego-test.postman_collection.json`:
  - Health check and debug endpoints (if present in API).
- `postman/zapier-phase5-wiring.postman_collection.json`:
  - End-to-end wiring test: webhook trigger → outbox publish → worker consume.

## Routes Summary
- `GET /health` → Liveness check.
- `POST /webhook/:zapId` → Creates ZapRun + Outbox job and publishes to Kafka.

## Execution Flow (High Level)
1. Webhook hits `POST /webhook/:zapId`.
2. Server creates `ZapRun` and `ZapRunOutbox`.
3. Outbox ID is published to Kafka.
4. Worker consumes outbox ID, claims job, executes step.
5. Step results are stored in `StepState` and next job is enqueued/published.
6. ZapRun completes when no further actions are defined.
7. `system.wait` schedules delayed outbox records using `resumeAt`.

## Notes
- This repository appears to be a local dev environment; `.env` contains sensitive data and should not be shared.
- `phase5.txt` and `new.sql` are supporting docs/scripts for execution persistence and indexing.