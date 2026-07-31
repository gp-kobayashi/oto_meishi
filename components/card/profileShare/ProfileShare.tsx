"use client";

import { useState } from "react";
import QRCode from "../QRCode/QRCode";
import { buildSiteUrl } from "@/lib/siteUrl";
import styles from "./ProfileShare.module.css";

export default function ProfileShare({ username }: { username: string }) {
  const profileUrl = buildSiteUrl(username);
  const [copyStatus, setCopyStatus] = useState<
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
      <button
        type="button"
        className={styles.copyButton}
        onClick={() => void copyProfileUrl()}
      >
        URLをコピー
      </button>
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
    </section>
  );
}
