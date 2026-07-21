"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";
import styles from "./NotificationBell.module.css";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications?: NotificationItem[];
  unreadCount?: number;
  error?: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export default function NotificationBell({ accessToken }: { accessToken: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const loadRequestIdRef = useRef(0);

  const loadNotifications = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as NotificationResponse;
      if (!response.ok) {
        throw new Error(result.error || "通知を取得できませんでした。");
      }
      if (requestId === loadRequestIdRef.current) {
        setNotifications(result.notifications ?? []);
        setUnreadCount(result.unreadCount ?? 0);
      }
      return result;
    } catch (loadError) {
      if (requestId === loadRequestIdRef.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "通知を取得できませんでした。",
        );
      }
      return null;
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [accessToken]);

  const markNotificationsAsRead = useCallback(async () => {
    setReadError("");
    try {
      const response = await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "通知を既読にできませんでした。");
      }

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.readAt ? notification : { ...notification, readAt },
        ),
      );
      setUnreadCount(0);
    } catch (markError) {
      setReadError(
        markError instanceof Error
          ? markError.message
          : "通知を既読にできませんでした。",
      );
    }
  }, [accessToken]);

  const refreshOpenedPanel = useCallback(async () => {
    setReadError("");
    const result = await loadNotifications();
    if (result && (result.unreadCount ?? 0) > 0) {
      await markNotificationsAsRead();
    }
  }, [loadNotifications, markNotificationsAsRead]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadNotifications]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closePanel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, isOpen]);

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={isOpen ? "通知を閉じる" : "通知を開く"}
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        onClick={() => {
          if (isOpen) {
            closePanel();
          } else {
            setIsOpen(true);
            void refreshOpenedPanel();
          }
        }}
      >
        <FiBell aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-label={`未読通知${unreadCount}件`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          id="notification-panel"
          className={styles.panel}
          aria-labelledby="notification-heading"
        >
          <div className={styles.heading}>
            <h2 id="notification-heading">通知</h2>
            {unreadCount > 0 ? <span>未読 {unreadCount}件</span> : null}
          </div>
          {readError ? (
            <p className={styles.readError} role="status">{readError}</p>
          ) : null}
          {loading ? (
            <p className={styles.message}>読み込み中...</p>
          ) : error ? (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void refreshOpenedPanel()}>
                再読み込み
              </button>
            </div>
          ) : notifications.length ? (
            <ol className={styles.list}>
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={notification.readAt ? styles.read : styles.unread}
                >
                  <div className={styles.itemHeading}>
                    <h3>{notification.title}</h3>
                    {!notification.readAt ? <span>未読</span> : null}
                  </div>
                  <p>{notification.message}</p>
                  <time dateTime={notification.createdAt}>
                    {formatDate(notification.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.message}>通知はありません。</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
