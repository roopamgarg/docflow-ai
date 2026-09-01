import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 otherwise writes its own AGENTS.md / CLAUDE.md on `next dev`.
  // This repo keeps its agent rules in `.claude/rules/`.
  agentRules: false,

  // Next 16 runs Turbopack by default. Turbopack resolves the optional
  // `canvas` / `encoding` requires on its own; the empty object is the
  // documented way to acknowledge the webpack config below so the build
  // does not error out.
  turbopack: {},

  // Kept for `next dev --webpack` / `next build --webpack`: both tesseract.js
  // and pdfjs-dist reference the optional Node-only `canvas` package (and
  // `encoding`, via node-fetch). Neither must be bundled for the browser —
  // extraction runs fully client-side.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;
