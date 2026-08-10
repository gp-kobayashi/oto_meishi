import os from "node:os";
import path from "node:path";

interface AudioTempRootOptions {
  nodeEnv?: string;
  projectRoot?: string;
  osTempDir?: string;
}

export function resolveAudioTempRoot({
  nodeEnv = process.env.NODE_ENV,
  projectRoot = process.cwd(),
  osTempDir = os.tmpdir(),
}: AudioTempRootOptions = {}): string {
  return nodeEnv === "production"
    ? path.join(osTempDir, "oto-meishi")
    : path.join(projectRoot, ".tmp");
}

export const AUDIO_TEMP_ROOT = resolveAudioTempRoot();
