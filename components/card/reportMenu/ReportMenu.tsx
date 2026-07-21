"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ReportMenu.module.css";

export default function ReportMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
          <button type="button" className={styles.reportButton} role="menuitem">
            通報する
          </button>
        </div>
      ) : null}
    </div>
  );
}
