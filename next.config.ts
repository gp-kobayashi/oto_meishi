import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${
    isDevelopment ? " http://127.0.0.1:* ws://127.0.0.1:*" : ""
  }`,
  "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
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
