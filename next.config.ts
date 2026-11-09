import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Self-contained server bundle for the Cloud Run image (site.Dockerfile).
  output: "standalone",
  async redirects() {
    // Apex -> www. Vercel did this via its domain settings; on Cloud Run the
    // app has to do it itself.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "clipchase.xyz" }],
        destination: "https://www.clipchase.xyz/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
