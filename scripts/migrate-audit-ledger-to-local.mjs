import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const EVENT_MODELS = [
  ["interactionEvent", "InteractionEvent"],
  ["decisionEvent", "DecisionEvent"],
  ["generationEvent", "GenerationEvent"],
  ["outcomeEvent", "OutcomeEvent"],
];

const atlasUrl = process.env.DATABASE_URL?.trim();
const localUrl = process.env.LOCAL_DATABASE_URL?.trim() || "mongodb://127.0.0.1:27017/checklist_local?replicaSet=rs0";
const batchSize = Math.max(50, Number.parseInt(process.env.AUDIT_MIGRATION_BATCH_SIZE || "1000", 10) || 1000);
const purgeAtlas = process.argv.includes("--purge-atlas");
const force = process.argv.includes("--force");

if (!atlasUrl) {
  throw new Error("DATABASE_URL is required and must point at MongoDB Atlas.");
}

if (purgeAtlas && !force) {
  throw new Error("Refusing to purge Atlas without --force.");
}

const atlas = new PrismaClient({ datasourceUrl: atlasUrl });
const local = new PrismaClient({ datasourceUrl: localUrl });

function buildCursorWhere(lastRecord) {
  if (!lastRecord) {
    return undefined;
  }

  return {
    OR: [
      { createdAt: { gt: lastRecord.createdAt } },
      {
        AND: [
          { createdAt: lastRecord.createdAt },
          { id: { gt: lastRecord.id } },
        ],
      },
    ],
  };
}

async function writeBatch(delegate, rows) {
  if (!rows.length) {
    return;
  }

  try {
    await delegate.createMany({
      data: rows,
    });
    return;
  } catch (error) {
    console.warn(`[AUDIT MIGRATION] createMany fallback engaged: ${error.message}`);
  }

  const writes = rows.map((row) =>
    delegate.create({ data: row }).catch((error) => {
      if (error?.code === "P2002") {
        return null;
      }

      throw error;
    }),
  );

  for (let index = 0; index < writes.length; index += 25) {
    await Promise.all(writes.slice(index, index + 25));
  }
}

async function migrateModel(delegateName, modelName) {
  const atlasDelegate = atlas[delegateName];
  const localDelegate = local[delegateName];
  const sourceCount = await atlasDelegate.count();
  const targetCountBefore = await localDelegate.count();

  console.log(`[AUDIT MIGRATION] ${modelName}: ${sourceCount} source rows`);

  if (sourceCount === 0) {
    return { modelName, sourceCount, copiedCount: 0, targetCount: targetCountBefore };
  }

  if (targetCountBefore >= sourceCount) {
    console.log(`[AUDIT MIGRATION] ${modelName}: local store already has ${targetCountBefore} rows, skipping recopy`);

    if (purgeAtlas) {
      const deletion = await atlasDelegate.deleteMany({});
      console.log(`[AUDIT MIGRATION] ${modelName}: purged ${deletion.count} Atlas rows`);
    }

    return { modelName, sourceCount, copiedCount: sourceCount, targetCount: targetCountBefore };
  }

  let copiedCount = 0;
  let lastRecord = null;

  while (true) {
    const batch = await atlasDelegate.findMany({
      where: buildCursorWhere(lastRecord),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
    });

    if (!batch.length) {
      break;
    }

    await writeBatch(localDelegate, batch);
    copiedCount += batch.length;
    lastRecord = batch[batch.length - 1];
    console.log(`[AUDIT MIGRATION] ${modelName}: copied ${copiedCount}/${sourceCount}`);
  }

  const targetCount = await localDelegate.count();
  if (targetCount < sourceCount) {
    throw new Error(`${modelName} target count ${targetCount} is lower than source count ${sourceCount}.`);
  }

  if (purgeAtlas) {
    const deletion = await atlasDelegate.deleteMany({});
    console.log(`[AUDIT MIGRATION] ${modelName}: purged ${deletion.count} Atlas rows`);
  }

  return { modelName, sourceCount, copiedCount, targetCount };
}

async function main() {
  console.log(`[AUDIT MIGRATION] Atlas source: ${atlasUrl}`);
  console.log(`[AUDIT MIGRATION] Local target: ${localUrl}`);
  console.log(`[AUDIT MIGRATION] Batch size: ${batchSize}`);
  console.log(`[AUDIT MIGRATION] Purge Atlas after copy: ${purgeAtlas ? "yes" : "no"}`);

  await atlas.$connect();
  await local.$connect();

  const summaries = [];
  for (const [delegateName, modelName] of EVENT_MODELS) {
    summaries.push(await migrateModel(delegateName, modelName));
  }

  console.table(summaries);
}

main()
  .catch((error) => {
    console.error("[AUDIT MIGRATION] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([atlas.$disconnect(), local.$disconnect()]);
  });
