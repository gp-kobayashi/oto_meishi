const MAX_CONCURRENT_AUDIO_CONVERSIONS = 1;

let activeAudioConversions = 0;

export function tryAcquireAudioConversionSlot(): (() => void) | null {
  if (activeAudioConversions >= MAX_CONCURRENT_AUDIO_CONVERSIONS) {
    return null;
  }

  activeAudioConversions += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeAudioConversions = Math.max(0, activeAudioConversions - 1);
  };
}
