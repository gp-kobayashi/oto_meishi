import type { NextConfig } from "next";

export const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  serverExternalPackages: ["@ffprobe-installer/ffprobe"],
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/api/audio/upload": [
      "./node_modules/@ffprobe-installer/**/*",
      "./node_modules/ffmpeg-static/**/*",
    ],
  },
};

export default nextConfig;
