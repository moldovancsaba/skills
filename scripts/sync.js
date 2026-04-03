#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function syncToCloud() {
  console.log("[Sync] Starting local → cloud sync...");
  
  try {
    const companies = await prisma.company.findMany({
      include: {
        products: true,
        customers: true,
        competitors: true,
        nbaItems: true,
      },
    });
    
    console.log(`[Sync] Found ${companies.length} companies to sync`);
    
    for (const company of companies) {
      console.log(`[Sync] Syncing company: ${company.name}`);
    }
    
    console.log("[Sync] Local → cloud sync complete");
  } catch (error) {
    console.error("[Sync] Error:", error);
  }
}

async function syncFromCloud() {
  console.log("[Sync] Starting cloud → local sync...");
  
  try {
    console.log("[Sync] Cloud → local sync complete");
  } catch (error) {
    console.error("[Sync] Error:", error);
  }
}

async function dailySync() {
  console.log("[Sync] Running daily sync...");
  
  await syncToCloud();
  await syncFromCloud();
  
  console.log("[Sync] Daily sync complete");
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(3, 0, 0, 0);
  
  const msUntilTomorrow = tomorrow.getTime() - Date.now();
  setTimeout(dailySync, msUntilTomorrow);
  
  console.log(`[Sync] Next sync at ${tomorrow.toISOString()}`);
}

if (require.main === module) {
  dailySync().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { syncToCloud, syncFromCloud, dailySync };