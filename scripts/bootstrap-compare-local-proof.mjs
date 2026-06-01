console.error(
  [
    "bootstrap-compare-local-proof is disabled.",
    "Synthetic Compare proof listings are not allowed.",
    "Use `npm run publish:compare-source-backed -- --companyId <companyId>` to publish source-backed Visitor content through CHECK Local.",
  ].join("\n"),
);
process.exitCode = 1;
