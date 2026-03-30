# Zaprun

A local TypeScript + Express workflow automation engine inspired by Zapier. Accepts webhook triggers, creates durable run records, schedules work through an outbox pattern, executes steps with Kafka-backed workers, and supports retries and delayed execution.

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** (local or hosted — the project uses NeonDB by default)
- **Apache Kafka** (local broker on `localhost:9092` by default)

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Configure environment:**

Copy `.env.example` (or create `.env`) with:

```
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
ENCRYPTION_KEY=your-32-char-encryption-key
```

3. **Set up the database:**

```bash
npx prisma migrate dev
npx prisma generate
node prisma/seed.js
```

4. **Run in development (auto-reloads):**

```bash
# API server only
npm run dev:server

# Worker (Kafka consumer + timer) only
npm run dev:worker

# Both concurrently
npm run dev:all
```

5. **Build and run for production:**

```bash
npm run build
npm run start:all
```

## Project Structure

```
src/
  server.ts                  # API entrypoint (port 3000)
  api/
    app.ts                   # Express app + route mounting
    routes/
      webhook.ts             # POST /webhook/:zapId
      zaps.ts                # POST /zaps, PUT /zaps/:zapId
      zapRuns.ts             # POST /zapRuns/:zapRunId/replay
  db/
    prisma.ts                # Shared Prisma client (pg pool)
  engines/
    handleOutboxJob.ts       # Core step execution engine
    systemWait.ts            # Delayed execution handler
  executors/
    types.ts                 # Executor contract
    index.ts                 # Executor registry
    http.executor.ts         # HTTP request executor
  kafka/
    producer.ts              # Kafka producer + topic setup
    consumer.ts              # Kafka consumer
  outbox/
    claim.ts                 # Atomic job claiming with lease
    complete.ts              # Mark job completed
    fail.ts                  # Mark job failed
    enqueue.ts               # Enqueue next step
  services/
    versionBuilder.ts        # Snapshot zap actions → frozen version
  utils/
    interpolate.ts           # Template engine for step configs
    hashStepDefinition.ts    # SHA-256 step fingerprinting
    logger.ts                # Pino structured logger
  workers/
    consumer.worker.ts       # Worker entrypoint
    timer.worker.ts          # Polls for due delayed jobs
```

## API Endpoints

| Method | Path                           | Description              |
| ------ | ------------------------------ | ------------------------ |
| GET    | `/health`                      | Liveness check           |
| POST   | `/webhook/:zapId`              | Trigger a ZapRun         |
| POST   | `/zaps`                        | Create a Zap             |
| PUT    | `/zaps/:zapId`                 | Update a Zap             |
| POST   | `/zapRuns/:zapRunId/replay`    | Replay a past ZapRun     |

## npm Scripts

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `dev:server`    | Start API with hot-reload                |
| `dev:worker`    | Start worker with hot-reload             |
| `dev:all`       | Start both concurrently                  |
| `build`         | Compile TypeScript                       |
| `start`         | Run compiled API server                  |
| `start:worker`  | Run compiled worker                      |
| `start:all`     | Run both API + worker                    |

## License

ISC
