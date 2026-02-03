// import { prisma } from "../db/prisma";
// async function pollOutbox() {
//   const OutboxEvent = await prisma.zapRunOutbox.findFirst({
//     where: {
//       status: "pending",
//     },
//     orderBy: {
//       createdAt: "asc",
//     },
//   });
//   if (!OutboxEvent) {
//     return;
//   }
//   // await prisma.zapRunOutbox.update({
//   //   where: { id: OutboxEvent.id },
//   //   // data: { status: "published" },
//   // });
//   // console.log("Outbox event published:", OutboxEvent.id, OutboxEvent.eventType);
// }
// async function startOutboxWorker() {
//   console.log("Outbox worker started");

//   setInterval(async () => {
//     try {
//       await pollOutbox();
//     } catch (err) {
//       console.error("Worker error:", err);
//     }
//   }, 1000);
// }
// startOutboxWorker();
