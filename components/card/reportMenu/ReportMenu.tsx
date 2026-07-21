"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ReportMenu.module.css";
import ReportDialog from "./ReportDialog";

export default function ReportMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeDialog = () => {
    setIsDialogOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={styles.container} ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="通報メニューを開く"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="profile-report-menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true" className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {isOpen ? (
        <div id="profile-report-menu" className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.reportButton}
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              setIsDialogOpen(true);
            }}
          >
            通報する
          </button>
        </div>
      ) : null}
      {isDialogOpen ? <ReportDialog onClose={closeDialog} /> : null}
    </div>
  );
}
