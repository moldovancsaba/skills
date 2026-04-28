const https = require("https");
const http = require("http");
const { normalizeText, truncate } = require("./shared");

/**
 * checklist FETCHER
 * v0.12.1-DURABLE
 */

async function fetchUrlContent(url) {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith("http")) {
      return reject(new Error("Invalid URL provided to fetcher."));
    }

    const protocol = url.startsWith("https") ? https : http;
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      timeout: 15000 
    };

    protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith("http")) {
          const origin = new URL(url).origin;
          redirectUrl = new URL(redirectUrl, origin).href;
        }
        return fetchUrlContent(redirectUrl).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return resolve({ title: "Error", content: `Status: ${res.statusCode}`, status: res.statusCode });
      }

      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const titleMatch = data.match(/<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled Source";

        let body = data
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        resolve({
          title: normalizeText(title),
          content: truncate(body, 10000),
          status: 200
        });
      });
    }).on("error", (err) => {
      resolve({ title: "Unreachable", content: `Error: ${err.message}`, status: 500 });
    });
  });
}

module.exports = {
  fetchUrlContent
};
