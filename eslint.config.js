const nextConfig = require("eslint-config-next");

module.exports = [
  ...nextConfig,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];
