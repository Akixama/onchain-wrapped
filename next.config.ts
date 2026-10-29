import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The project lives inside a folder that has its own lockfile higher up; pin the root here.
  outputFileTracingRoot: process.cwd(),
  // Share images read these font files at runtime; make sure they ship with the function.
  outputFileTracingIncludes: { "/api/og/[id]/[card]": ["./assets/fonts/**"] },
  // The wallet quiz was removed: old quiz links open the Wrapped itself.
  async redirects() {
    return [{ source: "/q/:id", destination: "/w/:id", permanent: false }];
  },
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
