import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { agentFeedback: true },
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return [{ source: "/", destination: "/replay", permanent: false }];
  },
};

export default nextConfig;
