import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The warehouse is a local SQLite file read on every request; keep rendering dynamic and simple for the prototype.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3", "playwright-core"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
