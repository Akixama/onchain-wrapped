import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The project lives inside a folder that has its own lockfile higher up; pin the root here.
  outputFileTracingRoot: process.cwd(),
  // Share images read these font files at runtime; make sure they ship with the function.
  outputFileTracingIncludes: { "/api/og/[id]/[card]": ["./assets/fonts/**"] },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
