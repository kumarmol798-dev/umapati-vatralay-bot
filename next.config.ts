import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-08c7b40a-ea94-4526-b862-88f66ea5d7b1.space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;