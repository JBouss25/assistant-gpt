import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pas de pastille de développement (captures d'écran des stores).
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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
