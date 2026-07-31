"use client";

import { useState, useSyncExternalStore } from "react";
import QRCode from "../QRCode/QRCode";
import { buildSiteUrl } from "@/lib/siteUrl";
import styles from "./ProfileShare.module.css";

const subscribeToShareAvailability = () => () => {};
const getShareAvailability = () => typeof navigator.share === "function";
const getServerShareAvailability = () => false;

export default function ProfileShare({ username }: { username: string }) {
  const profileUrl = buildSiteUrl(username);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const canShare = useSyncExternalStore(
    subscribeToShareAvailability,
    getShareAvailability,
    getServerShareAvailability,
  );
  const [shareStatus, setShareStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const copyProfileUrl = async () => {
    setCopyStatus("idle");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable.");
      }
      await navigator.clipboard.writeText(profileUrl);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  };

  const shareProfileUrl = async () => {
    setShareStatus("idle");
    try {
      await navigator.share({
        title: "oto_meishi",
        text: "oto_meishiのプロフィールを共有します。",
        url: profileUrl,
      });
      setShareStatus("success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setShareStatus("error");
    }
  };

  return (
    <section className={styles.container} aria-labelledby="profile-share-title">
      <p id="profile-share-title" className={styles.title}>
        QRコード・URLで名刺を共有
      </p>
      <QRCode username={username} />
      <a
        className={styles.profileUrl}
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {profileUrl}
      </a>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.copyButton}
          onClick={() => void copyProfileUrl()}
        >
          URLをコピー
        </button>
        {canShare ? (
          <button
            type="button"
            className={styles.shareButton}
            onClick={() => void shareProfileUrl()}
          >
            端末で共有
          </button>
        ) : null}
      </div>
      {copyStatus === "success" ? (
        <p className={styles.successMessage} role="status">
          URLをコピーしました。
        </p>
      ) : null}
      {copyStatus === "error" ? (
        <p className={styles.errorMessage} role="alert">
          URLをコピーできませんでした。
        </p>
      ) : null}
      {shareStatus === "success" ? (
        <p className={styles.successMessage} role="status">
          プロフィールを共有しました。
        </p>
      ) : null}
      {shareStatus === "error" ? (
        <p className={styles.errorMessage} role="alert">
          プロフィールを共有できませんでした。
        </p>
      ) : null}
    </section>
  );
}
