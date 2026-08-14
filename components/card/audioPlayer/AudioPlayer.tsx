"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import styles from "./AudioPlayer.module.css";

/** mm:ss 形式にフォーマット */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TITLE_SCROLL_END_PADDING = 4;

const AudioPlayer = ({
  userId,
  audioTitle,
  previewAudioUrl = "",
}: {
  userId: string;
  audioTitle: string;
  previewAudioUrl?: string;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const titleViewportRef = useRef<HTMLSpanElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  const [isTitleScrolling, setIsTitleScrolling] = useState(false);
  const [titleScrollDistance, setTitleScrollDistance] = useState(0);

  useEffect(() => {
    const viewport = titleViewportRef.current;
    const text = titleTextRef.current;
    if (!viewport || !text || typeof window === "undefined") {
      return;
    }

    if (typeof window.matchMedia !== "function") {
      return;
    }

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const updateTitleScrolling = () => {
      const overflowDistance = Math.max(
        0,
        text.scrollWidth - viewport.clientWidth,
      );
      const shouldScroll = !reducedMotionQuery.matches && overflowDistance > 1;
      setTitleScrollDistance(
        shouldScroll ? overflowDistance + TITLE_SCROLL_END_PADDING : 0,
      );
      setIsTitleScrolling(shouldScroll);
    };

    updateTitleScrolling();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTitleScrolling);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(text);
    window.addEventListener("resize", updateTitleScrolling);
    reducedMotionQuery.addEventListener?.("change", updateTitleScrolling);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTitleScrolling);
      reducedMotionQuery.removeEventListener?.("change", updateTitleScrolling);
    };
  }, [audioTitle]);

  /* ---------- audio イベント ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  /* ---------- 再生 / 一時停止 ---------- */
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      setPlaybackError("");

      if (!audio.src) {
        setIsLoading(true);
        try {
          const response = await fetch(
            `/api/audio/playback?userId=${encodeURIComponent(userId)}`,
            { cache: "no-store" },
          );
          const result = await response.json().catch(() => ({}));

          if (!response.ok || typeof result.audioUrl !== "string") {
            throw new Error(result.error || "音声を再生できませんでした。");
          }

          audio.src = result.audioUrl;
        } catch (error) {
          setPlaybackError(
            error instanceof Error
              ? error.message
              : "音声を再生できませんでした。",
          );
          return;
        } finally {
          setIsLoading(false);
        }
      }

      try {
        await audio.play();
      } catch {
        setPlaybackError("音声を再生できませんでした。");
        return;
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, userId]);

  /* ---------- シークバー クリック ---------- */
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar || !duration) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      audio.currentTime = ratio * duration;
    },
    [duration],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={styles.audioContainer}>
      {/* 非表示の audio 要素 */}
      <audio
        ref={audioRef}
        preload={previewAudioUrl ? "metadata" : "none"}
        src={previewAudioUrl || undefined}
      />

      {/* 上段: 再生ボタン ＋ プログレスバー + 時間*/}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playButton}
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? "一時停止" : "再生"}
        >
          {isPlaying ? (
            /* Pause アイコン */
            <svg
              viewBox="0 0 24 24"
              className={styles.icon}
              fill="currentColor"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            /* Play アイコン */
            <svg
              viewBox="0 0 24 24"
              className={styles.icon}
              fill="currentColor"
            >
              <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.06-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z" />
            </svg>
          )}
        </button>

        {/* プログレスバー */}
        <div
          className={styles.progressBar}
          ref={progressRef}
          onClick={handleSeek}
          role="slider"
          aria-label="再生位置"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
          <div
            className={styles.progressThumb}
            style={{ left: `${progress}%` }}
          />
        </div>
        <p className={styles.time}>
          {formatTime(currentTime)}
          <span className={styles.timeSeparator}>/</span>
          {formatTime(duration)}
        </p>
      </div>
      <p className={styles.title}>
        <span
          ref={titleViewportRef}
          className={`${styles.titleViewport} ${isTitleScrolling ? styles.titleViewportScrolling : ""}`}
          style={
            isTitleScrolling
              ? ({
                  "--title-scroll-distance": `${titleScrollDistance}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <span ref={titleTextRef} className={styles.titleText}>
            {audioTitle}
          </span>
        </span>
      </p>
      {playbackError ? (
        <p className={styles.title} role="alert">
          {playbackError}
        </p>
      ) : null}
    </div>
  );
};

export default AudioPlayer;
