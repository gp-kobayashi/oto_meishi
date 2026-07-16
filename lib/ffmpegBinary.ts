import path from "path";

// Next.jsのバンドラーがffmpeg-staticのパスを書き換えてしまうため、
// importを使わずprocess.cwd()から直接バイナリパスを構築する
export function getFfmpegBinaryPath(): string {
  const ffmpegExe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", ffmpegExe);
}
