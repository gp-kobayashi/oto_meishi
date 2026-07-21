"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ReportDialog.module.css";

const reportReasons = [
  { value: "inappropriate_audio", label: "不適切な音声" },
  { value: "harassment", label: "誹謗中傷・嫌がらせ" },
  { value: "unsafe_link", label: "危険または不正なリンク" },
  { value: "impersonation", label: "なりすまし" },
  { value: "other", label: "その他" },
] as const;

type ReportDialogProps = {
  profileId: string;
  onClose: () => void;
};

type ReportResponse = {
  error?: string;
};

export default function ReportDialog({
  profileId,
  onClose,
}: ReportDialogProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReason || isSubmitting) {
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
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ReportResponse;

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
            <button type="button" className={styles.submitButton} onClick={onClose}>
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
                    selectedReason === reason.value
                      ? styles.selectedReason
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={() => setSelectedReason(reason.value)}
                  />
                  <span>{reason.label}</span>
                </label>
              ))}
            </fieldset>

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
                  disabled={!selectedReason || isSubmitting}
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
