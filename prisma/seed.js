require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const connectionString = process.env["DATABASE_URL"];

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  const [availableTrigger, availableAction] = await Promise.all([
    prisma.availableTrigger.upsert({
      where: { key: "webhook" },
      update: {},
      create: { key: "webhook", name: "Webhook Trigger", schema: {} },
    }),
    prisma.availableAction.upsert({
      where: { key: "http" },
      update: {},
      create: { key: "http", name: "HTTP Request", schema: {} },
    }),
  ]);

  const user = await prisma.user.upsert({
    where: { email: "demo@zapier.local" },
    update: {},
    create: {
      email: "demo@zapier.local",
      password: "dev-secret",
    },
  });

  const zap = await prisma.zap.upsert({
    where: { id: "ego-test-zap" },
    update: {
      name: "Ego Test Zap",
      status: "active",
      userId: user.id,
    },
    create: {
      id: "ego-test-zap",
      name: "Ego Test Zap",
      status: "active",
      userId: user.id,
    },
  });

  await prisma.zapTrigger.upsert({
    where: { id: "ego-test-trigger" },
    update: {
      zapId: zap.id,
      availableTriggerId: availableTrigger.id,
      config: { sample: true },
    },
    create: {
      id: "ego-test-trigger",
      zapId: zap.id,
      availableTriggerId: availableTrigger.id,
      config: { sample: true },
    },
  });

  // reset actions for deterministic test (three steps, step 2 fails with 401)
  await prisma.zapAction.deleteMany({ where: { zapId: zap.id } });

  await prisma.zapAction.createMany({
    data: [
      {
        id: "ego-test-action-1",
        zapId: zap.id,
        availableActionId: availableAction.id,
        stepOrder: 1,
        config: {
          method: "GET",
          url: "https://jsonplaceholder.typicode.com/todos/1",
        },
      },
      {
        id: "ego-test-action-2",
        zapId: zap.id,
        availableActionId: availableAction.id,
        stepOrder: 2,
        config: {
          method: "GET",
          url: "https://httpstat.us/401",
        },
      },
      {
        id: "ego-test-action-3",
        zapId: zap.id,
        availableActionId: availableAction.id,
        stepOrder: 3,
        config: {
          method: "GET",
          url: "https://jsonplaceholder.typicode.com/posts/1",
        },
      },
    ],
  });

  await prisma.zapRun.upsert({
    where: { id: "ego-test-run" },
    update: {
      zapId: zap.id,
      triggerPayload: { source: "seed" },
      status: "pending",
      failedStepId: null,
      error: null,
      finishedAt: null,
    },
    create: {
      id: "ego-test-run",
      zapId: zap.id,
      triggerPayload: { source: "seed" },
      status: "pending",
      failedStepId: null,
      error: null,
      finishedAt: null,
    },
  });
}

main()
  .then(() => {
    console.log("Seed completed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
