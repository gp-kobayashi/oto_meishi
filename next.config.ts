import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
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
