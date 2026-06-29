# Zaprun

An automation engine where you describe what you want in plain English, and an AI multi-agent system builds and runs it. Connect your services, tell Zaprun what to automate, and it handles the execution — retries, auth, data passing between steps, everything.

## What It Is

Zaprun has three layers:

**1. The execution engine.** You define a sequence of API calls (steps). When triggered, Zaprun executes each step in order. Steps pass data to each other via template interpolation (`{{steps.step0.title}}`). If a step fails with a retriable error (5xx, network timeout), it retries up to 3 times. If a step needs to wait, it delays execution via an outbox + timer pattern without blocking the worker.

**2. The plugin system.** Each integration (GitHub, Slack, Notion, Stripe, Gmail) is a plugin — a manifest that defines what triggers and actions are available, what config each action needs (JSON Schema), and how authentication works. The engine is provider-agnostic. It executes HTTP requests. The plugin tells it which URL, method, headers, and body to use. Adding a new provider is adding a manifest and reusing the HTTP executor. Companies can connect their own internal APIs by providing a Swagger/OpenAPI spec.

**3. The connection layer.** Users connect their accounts once (OAuth2 or API key). Zaprun encrypts and stores tokens. When a step runs, the engine resolves the right connection, refreshes expired tokens, and injects auth headers. The user never handles tokens.

## How It Works

```
You: "When someone stars my GitHub repo, create a Notion page and notify Slack"
  ↓
AI Multi-Agent System:
  Agent 1: Parse intent → trigger: github.webhook, actions: [notion.create_page, slack.post_message]
  Agent 2: Detect missing connections → prompt you to connect them
  Agent 3: Build full config JSON with connectionIds
  Agent 4: Validate against schemas, confirm with you
  ↓
POST /zaps → saved
  ↓
Webhook fires
  → ZapRun created (pinned to frozen version snapshot)
  → Outbox row created (step 0)
  → Published to Kafka
  ↓
Worker picks up outbox ID
  → Atomic claim (prevents duplicate execution across workers)
  → Load step definition from frozen version
  → Interpolate {{templates}} with real values
  → Validate config against JSON Schema
  → Resolve connection auth (OAuth refresh / API key decrypt)
  → Execute HTTP request
  → Record output
  → Enqueue next step → repeat until done
```

## What's Built

| Component | Status |
|---|---|
| Execution engine (outbox pattern, Kafka workers, retries) | ✅ |
| Plugin system (dynamic manifest loading, JSON Schema validation) | ✅ |
| Connection management (OAuth2 PKCE, API key, token refresh, AES-256-GCM encryption) | ✅ |
| Providers: GitHub, Slack, Notion, Gmail, Stripe | ✅ |
| CLI (`zap` command — auth, connect, create, list, logs, replay, test) | ✅ |
| Template interpolation (`{{trigger.x}}`, `{{steps.N.x}}`) | ✅ |
| Version pinning (runs frozen to snapshot, not affected by edits) | ✅ |
| Delayed execution (`system.wait` + timer worker) | ✅ |
| Replay past runs | ✅ |
| Structured logging with secret redaction (Pino) | ✅ |

## What It Will Become

Zaprun is being built as an AI-native automation platform. The goal is that you never manually configure anything. You describe what you want in plain English, and a multi-agent AI system builds, connects, and runs it.

**The AI layer.** A separate Python microservice (FastAPI + LangGraph) that coordinates with the TypeScript engine via shared Postgres and HTTP APIs. When you say "when someone stars my GitHub repo, create a Notion page and notify Slack", the AI parses your intent, maps it to available actions, builds the full config, handles connection setup, validates everything, and submits it.

**The multi-agent flow.** The AI doesn't just generate JSON. It has a conversation with you:

1. **Intent Parser** — understands what you want, maps to triggers and actions
2. **Provider Generator** — if a provider doesn't exist, asks for a Swagger/OpenAPI spec and auto-generates the manifest (so companies can connect their internal APIs)
3. **Connection Manager** — detects which connections are missing, opens OAuth URLs in-session, asks "is that done?", verifies before proceeding
4. **Config Builder** — builds the full automation config with connectionIds
5. **Validator** — confirms the final automation with you before submitting

**Internal company APIs.** Companies don't use just GitHub and Slack. They have internal Jira, custom ERPs, proprietary services. The AI will read their Swagger/OpenAPI docs and auto-generate manifests — so those internal APIs become available as providers without writing any plugin code.

**What the AI produces vs what it doesn't.** The AI only produces JSON configs. It never executes anything. It never handles tokens. It never runs steps. The TypeScript engine does all of that. The AI is the brain that understands what you want. The engine is the hands that do it.

## What's Left To Build

| Feature | Phase |
|---|---|
| Exponential backoff on retries | Phase 5 |
| Dead letter queue for failed runs | Phase 5 |
| Per-step execution timeouts | Phase 5 |
| AI microservice (Python + LangGraph) | Phase 7 |
| Swagger/OpenAPI manifest generation | Phase 7 |
| Multi-agent conversation flow | Phase 7 |
| Conditional workflows (if/else) | Phase 6 |
| Parallel step execution | Phase 6 |
| Cron triggers | Phase 6 |

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** (local or hosted — the project uses NeonDB by default)
- **Apache Kafka** (local broker on `localhost:9092` by default)

## Getting Started

```bash
npm install
```

Configure `.env`:

```
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
ENCRYPTION_KEY=your-32-char-encryption-key
```

```bash
npx prisma migrate dev
npx prisma generate
node prisma/seed.js
```

```bash
npm run dev:all    # Start API + worker concurrently
```

## Project Structure

```
src/
  server.ts                     # API entrypoint (port 3000)

  api/
    app.ts                      # Express app + route mounting
    routes/
      webhook.ts                # POST /webhook/:zapId — triggers a run
      zaps.ts                   # POST/PUT/DELETE /zaps — CRUD automations
      zapRuns.ts                # GET/POST /zapRuns — run history + replay
      providers.ts              # GET /providers — list available providers/actions
      oauth/auth.ts             # GET /auth/:provider/start|callback — OAuth2 flow
      apiKeys/connections.ts    # POST/GET /connections — API key connection management

  auth/
    types.ts                    # ResolvedAuth, AuthResolver types
    services/connectionAuth.ts  # Auth dispatcher (routes by authType)
    resolvers/
      oauth2.ts                 # OAuth2 token refresh, decryption, resolution
      apiKey.ts                 # API key decryption + header/query placement
      none.ts                   # No auth (returns empty)

  db/
    prisma.ts                   # Shared Prisma client (pg pool)

  engines/
    handleOutboxJob.ts          # Core execution engine — the brain of Zaprun
    pluginRegistry.ts           # Dynamic plugin discovery + manifest sync
    systemWait.ts               # Delayed execution handler

  kafka/
    producer.ts                 # Kafka producer + topic setup
    consumer.ts                 # Kafka consumer + message handler

  outbox/
    claim.ts                    # Atomic job claiming with 60s lease
    complete.ts                 # Mark job completed
    fail.ts                     # Mark job failed
    enqueue.ts                  # Enqueue next step (stepIndex + 1)

  plugins/
    http/                       # Generic HTTP (reference plugin)
    Notion/                     # Notion API (OAuth2)
    github/                     # GitHub REST API (OAuth2 + webhook)
    gmail/                      # Gmail API (OAuth2 + Pub/Sub)
    slack/                      # Slack Web API (OAuth2 + Events)
    stripe/                     # Stripe API (API key + webhook)

  services/
    versionBuilder.ts           # Snapshot zap actions → frozen ZapVersion

  types/
    manifest.ts                 # ProviderManifest, ActionManifest, AuthConfig types

  utils/
    interpolate.ts              # Template engine: {{trigger.x}}, {{steps.N.x}}
    hashStepDefinition.ts       # SHA-256 step fingerprinting
    validateStepConfig.ts       # AJV validation against manifest inputSchema
    encryption.ts               # AES-256-GCM encrypt/decrypt (tokens, keys)
    logger.ts                   # Pino structured logger with secret redaction

  cli/
    index.ts                    # Commander entrypoint
    api/client.ts               # Axios wrapper with retries
    config/store.ts             # Local config (~/.zap/config.json)
    commands/                   # auth, connect, create, list, logs, manage, replay, test
    utils/                      # output formatting, profile management, run monitoring

  workers/
    consumer.worker.ts          # Worker entrypoint (consumer + timer)
    timer.worker.ts             # Polls for due delayed jobs (jittered 4-6s)
```

## API Endpoints

| Method | Path                              | Description                        |
| ------ | --------------------------------- | ---------------------------------- |
| GET    | `/health`                         | Liveness check                     |
| GET    | `/me`                             | Current user info                  |
| POST   | `/webhook/:zapId`                 | Trigger a ZapRun                   |
| GET    | `/zaps`                           | List user's automations            |
| POST   | `/zaps`                           | Create a Zap with trigger+actions  |
| PUT    | `/zaps/:zapId`                    | Update a Zap                       |
| DELETE | `/zaps/:zapId`                    | Delete a Zap                       |
| GET    | `/zapRuns`                        | List run history (paginated)       |
| GET    | `/zapRuns/:id`                    | Get run detail + step states       |
| POST   | `/zapRuns/:zapRunId/replay`       | Replay a past ZapRun               |
| GET    | `/providers`                      | List all available providers       |
| GET    | `/providers/:key`                 | Provider detail + manifest         |
| GET    | `/providers/:key/actions`         | Provider actions + input schemas   |
| GET    | `/providers/:key/triggers`        | Provider triggers + output schemas |
| GET    | `/auth/:providerKey/start`        | Start OAuth2 flow (redirect)       |
| GET    | `/auth/:providerKey/callback`     | OAuth2 callback (exchange code)    |
| POST   | `/connections`                    | Create API key connection          |
| GET    | `/connections`                    | List user's connections            |
| GET    | `/connections/:id/test`           | Test connection health             |

## CLI

```bash
npx zap auth login              # Set up profile (API URL + userId)
npx zap auth whoami             # Verify active profile
npx zap connect github          # Connect GitHub via OAuth
npx zap connect list            # List all connections
npx zap create                  # Build automation interactively
npx zap list                    # List automations
npx zap logs <zapId>            # View run history
npx zap test <zapId>            # Trigger test run
npx zap pause <zapId>           # Pause automation
npx zap resume <zapId>          # Resume automation
npx zap delete <zapId>          # Delete automation
npx zap replay <runId>          # Replay a past run
```

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
