const { harvestResearch } = require("./lib/research");

harvestResearch(["latest marketing trends 2024"]).then(results => {
  console.log("Results found:", results.length);
  results.forEach((r, i) => {
    console.log(`[${i+1}] ${r.title} (${r.url})`);
  });
  process.exit(0);
});
