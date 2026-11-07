import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { agentFeedback: true },
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return [
      { source: "/", destination: "/replay", permanent: false },
      ...["baseline", "backend", "sample", "comparison"].map(mode => ({
        source: `/replay/${mode}`, destination: "/replay", permanent: false,
      })),
      { source: "/tuning/:path*", destination: "/audit", permanent: false },
      { source: "/audit/:path+", destination: "/audit", permanent: false },
      { source: "/emails/sample", destination: "/emails", permanent: false },
    ];
  },
};

export default nextConfig;
