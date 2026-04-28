const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function inspect() {
  const uri = process.env.DATABASE_URL || "";
  // Strip the database name from the URI to list all databases
  const baseUri = uri.split('?')[0].split('/').slice(0, -1).join('/') + '/?authSource=admin';
  
  console.log("Inspecting Atlas Cluster...");
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const admin = client.db("admin").admin();
    const { databases } = await admin.listDatabases();
    
    console.log("\nDatabases found:");
    for (const dbInfo of databases) {
      const db = client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      const collNames = collections.map(c => c.name);
      
      console.log(`- ${dbInfo.name} (${collNames.length} collections)`);
      if (collNames.includes("Product") || collNames.includes("Customer")) {
         const pCount = await db.collection("Product").countDocuments();
         const cCount = await db.collection("Customer").countDocuments();
         const rCount = await db.collection("Competitor").countDocuments();
         console.log(`  └─ Found checklist Models! [Products: ${pCount}, Customers: ${cCount}, Competitors: ${rCount}]`);
      }
    }
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("Inspection failed:", error.message);
  } finally {
    await client.close();
  }
}

inspect().catch(console.error);
