/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      "@doneisbetter/gds",
      "@doneisbetter/gds-core",
      "@doneisbetter/gds-admin",
      "@doneisbetter/gds-theme",
      "@mantine/core",
      "@mantine/hooks",
      "@mantine/notifications",
      "@tabler/icons-react",
      "recharts",
    ],
  },
};

module.exports = nextConfig;
