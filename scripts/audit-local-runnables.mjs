import { buildLocalRunnableInventory, validateLocalRunnableInventory } from "./local-runnable-inventory.mjs";

const inventory = buildLocalRunnableInventory();
const failures = validateLocalRunnableInventory(inventory);
const forbidden = inventory.filter((item) => item.lane === "FORBIDDEN_BYPASS");
const counts = inventory.reduce((acc, item) => ({ ...acc, [item.lane]: (acc[item.lane] || 0) + 1 }), {});

if (failures.length > 0) {
  console.error("Local runnable inventory audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Local runnable inventory audit passed: ${inventory.length} entrypoint(s) classified ` +
    `(System Health ${counts.SYSTEM_HEALTH || 0}, Playlist ${counts.PLAYLIST || 0}, ` +
    `Burst ${counts.HUMAN_APPROVED_BURST || 0}, Forbidden ${counts.FORBIDDEN_BYPASS || 0}).`,
);

if (forbidden.length > 0) {
  console.log("Forbidden bypasses remain for migration:");
  for (const item of forbidden) console.log(`- ${item.id}: ${item.migrationTarget}`);
}
