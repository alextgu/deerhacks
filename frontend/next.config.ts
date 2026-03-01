import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@coral-xyz/anchor"],
  // Use frontend as workspace root so Next doesn't pick parent lockfile
  turbopack: { root: process.cwd() },
};

export default nextConfig;
