export const MAX_AUDIO_FILE_SIZE_MEGABYTES = 30;
export const MAX_AUDIO_FILE_SIZE_BYTES =
  MAX_AUDIO_FILE_SIZE_MEGABYTES * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 180;

export const AUDIO_FILE_ACCEPT = [
  ".wav",
  ".mp3",
  ".m4a",
  ".mp4",
  ".caf",
  ".aif",
  ".aiff",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".webm",
  ".3gp",
  ".3g2",
  ".amr",
  ".wma",
  ".ape",
  ".wv",
  "audio/*",
].join(",");

export const AUDIO_UPLOAD_REQUIREMENTS =
  `3分以内・${MAX_AUDIO_FILE_SIZE_MEGABYTES}MB以下（WAV、MP3、M4A/AAC、CAF、AIFF、FLAC、Ogg/Opus、WebM、3GP/AMR、WMAなど）`;
