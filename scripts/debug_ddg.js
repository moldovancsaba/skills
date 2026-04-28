const https = require("https");

function harvestResearch(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        console.log("HTML Length:", data.length);
        const resultBlocks = data.split('class="result__body"');
        console.log("Result Blocks found:", resultBlocks.length - 1);
        resolve(resultBlocks.length - 1);
      });
    }).on("error", (err) => {
      console.error("Error:", err.message);
      resolve(0);
    });
  });
}

harvestResearch("latest marketing trends 2024").then(() => process.exit(0));
