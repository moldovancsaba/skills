import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing stale company locks...");
  const result = await prisma.globalSetting.deleteMany({
    where: {
      key: { startsWith: "lock:company:" }
    }
  });
  console.log(`Deleted ${result.count} stale locks.`);
}

main().finally(() => prisma.$disconnect());
