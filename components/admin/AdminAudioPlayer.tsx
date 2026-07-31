"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminAudioPlayer({
  profileId,
  snapshotId,
  label = "音声を確認",
}: {
  profileId: string;
  snapshotId?: string;
  label?: string;
}) {
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAudio = async () => {
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      if (!supabase) {
        throw new Error("認証クライアントが初期化されていません。");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("管理者アカウントでログインしてください。");
      }

      const response = await fetch(
        `/api/admin/audio/playback?profileId=${encodeURIComponent(profileId)}${
          snapshotId
            ? `&snapshotId=${encodeURIComponent(snapshotId)}`
            : ""
        }`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.audioUrl !== "string") {
        throw new Error(result.error || "音声を読み込めませんでした。");
      }

      setAudioUrl(result.audioUrl);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "音声を読み込めませんでした。",
      );
    } finally {
      setLoading(false);
    }
  };

  if (audioUrl) {
    return <audio controls autoPlay preload="metadata" src={audioUrl} />;
  }

  return (
    <div>
      <button type="button" disabled={loading} onClick={() => void loadAudio()}>
        {loading ? "音声を読み込み中..." : label}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
