import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. A stray lockfile in the parent folder
  // otherwise makes Turbopack watch the entire Desktop tree (including the
  // crm-deploy-wt copy and its node_modules), which spins the dev server CPU.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
