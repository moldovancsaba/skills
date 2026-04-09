const { PrismaClient } = require("@prisma/client");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function list() {
  const prisma = new PrismaClient();
  try {
    console.log("Connected. Listing collections in current DB...");
    const result = await prisma.$runCommandRaw({
      listCollections: 1,
      nameOnly: true
    });
    console.log("Collections:", JSON.stringify(result, null, 2));
    
    // Check counts for all models in schema
    const models = ["product", "customer", "competitor", "uploadedSourceFile", "nbaItem", "flashcard", "company"];
    for (const model of models) {
      const count = await prisma[model].count();
      if (count > 0) {
        console.log(`\x1b[32m%s\x1b[0m`, `- ${model}: ${count}`);
      } else {
        console.log(`- ${model}: 0`);
      }
    }

  } catch (error) {
    console.error("Failed:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

list().catch(console.error);
