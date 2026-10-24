import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` otherwise appends a block to the project's AGENTS.md. That file is human-owned.
  agentRules: false,
};

export default nextConfig;
