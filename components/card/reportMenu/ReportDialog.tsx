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
  onClose: () => void;
};

export default function ReportDialog({ onClose }: ReportDialogProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

        <p id="report-dialog-description" className={styles.description}>
          問題に最も近い項目を選択してください。
        </p>

        <fieldset className={styles.reasonList}>
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
                onChange={() => setSelectedReason(reason.value)}
              />
              <span>{reason.label}</span>
            </label>
          ))}
        </fieldset>

        <div className={styles.footer}>
          <p>送信された内容は運営が確認します。</p>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
