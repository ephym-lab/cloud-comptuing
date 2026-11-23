import type { NextConfig } from "next";

// Where the Flask API lives. In Docker this is http://backend:5000 (set at build time).
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5000";

const nextConfig: NextConfig = {
  output: "standalone",
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
  // The browser only ever talks to this Next.js server. /api/* is forwarded to Flask,
  // so auth cookies are same-origin and no CORS is needed for API calls.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
