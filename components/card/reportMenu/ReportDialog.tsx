"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ReportDialog.module.css";
import type { ReportableSocialLink } from "./types";

const reportReasons = [
  { value: "inappropriate_audio", label: "不適切な音声" },
  { value: "harassment", label: "誹謗中傷・嫌がらせ" },
  { value: "unsafe_link", label: "危険または不正なリンク" },
  { value: "impersonation", label: "なりすまし" },
  { value: "other", label: "その他" },
] as const;

type ReportDialogProps = {
  profileId: string;
  displayName?: string;
  audioTitle?: string;
  hasAudio?: boolean;
  audioStatus?: "active" | "hidden" | "removed";
  links?: ReportableSocialLink[];
  onClose: () => void;
};

type ReportResponse = {
  error?: string;
};

export default function ReportDialog({
  profileId,
  displayName,
  audioTitle = "",
  hasAudio = false,
  audioStatus = "active",
  links = [],
  onClose,
}: ReportDialogProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedReason ||
      isSubmitting ||
      (selectedReason === "inappropriate_audio" &&
        (!hasAudio || audioStatus !== "active")) ||
      (selectedReason === "unsafe_link" && !selectedLinkId)
    ) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          reason: selectedReason,
          details,
          targetType:
            selectedReason === "unsafe_link"
              ? "socialLink"
              : selectedReason === "inappropriate_audio"
                ? "audio"
                : "profile",
          targetId:
            selectedReason === "unsafe_link" ? selectedLinkId : profileId,
        }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as ReportResponse;

      if (!response.ok) {
        setErrorMessage(
          result.error ??
            "通報を送信できませんでした。時間をおいて再度お試しください。",
        );
        return;
      }

      setIsSubmitted(true);
    } catch {
      setErrorMessage(
        "通報を送信できませんでした。通信環境を確認して再度お試しください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        aria-describedby="report-dialog-description"
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>REPORT</p>
            <h2 id="report-dialog-title" className={styles.title}>
              このmeishiを通報
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label="通報画面を閉じる"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {isSubmitted ? (
          <div className={styles.success} role="status">
            <p className={styles.successTitle}>通報を受け付けました</p>
            <p>送信された内容を運営が確認します。</p>
            <button
              type="button"
              className={styles.submitButton}
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        ) : (
          <form onSubmit={submitReport}>
            <p id="report-dialog-description" className={styles.description}>
              問題に最も近い項目を選択してください。
            </p>

            <fieldset className={styles.reasonList} disabled={isSubmitting}>
              <legend className={styles.visuallyHidden}>通報理由</legend>
              {reportReasons.map((reason) => (
                <label
                  key={reason.value}
                  className={`${styles.reason} ${
                    selectedReason === reason.value ? styles.selectedReason : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    disabled={
                      isSubmitting ||
                      (reason.value === "inappropriate_audio" &&
                        (!hasAudio || audioStatus !== "active")) ||
                      (reason.value === "unsafe_link" && !links.length)
                    }
                    onChange={() => {
                      setSelectedReason(reason.value);
                      if (reason.value !== "unsafe_link") setSelectedLinkId("");
                      else if (links.length === 1)
                        setSelectedLinkId(links[0].id);
                    }}
                  />
                  <span>{reason.label}</span>
                </label>
              ))}
            </fieldset>

            {selectedReason === "unsafe_link" ? (
              <div className={styles.detailsLabel}>
                <label htmlFor="report-target-link">
                  通報対象のリンク（必須）
                </label>
                <select
                  id="report-target-link"
                  value={selectedLinkId}
                  onChange={(event) => setSelectedLinkId(event.target.value)}
                  disabled={isSubmitting || !links.length}
                >
                  <option value="">リンクを選択してください</option>
                  {links.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.label}（{link.service}）: {link.url}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {selectedReason ? (
              <p className={styles.description}>
                通報対象:{" "}
                {selectedReason === "inappropriate_audio"
                  ? `音声${audioTitle ? `「${audioTitle}」` : ""}`
                  : selectedReason === "unsafe_link"
                    ? (links.find((link) => link.id === selectedLinkId)
                        ?.label ?? "リンク")
                    : `プロフィール（${displayName}）`}
              </p>
            ) : null}

            <div className={styles.detailsLabel}>
              <label htmlFor="report-details">詳細（任意）</label>
              <textarea
                id="report-details"
                value={details}
                maxLength={500}
                disabled={isSubmitting}
                placeholder="問題のある箇所などを入力してください"
                onChange={(event) => setDetails(event.target.value)}
              />
              <span>{details.length} / 500文字</span>
            </div>

            {errorMessage ? (
              <p className={styles.error} role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className={styles.footer}>
              <p>送信された内容は運営が確認します。</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  disabled={isSubmitting}
                  onClick={onClose}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={
                    !selectedReason ||
                    isSubmitting ||
                    (selectedReason === "inappropriate_audio" &&
                      (!hasAudio || audioStatus !== "active")) ||
                    (selectedReason === "unsafe_link" && !selectedLinkId)
                  }
                >
                  {isSubmitting ? "送信中..." : "送信する"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
