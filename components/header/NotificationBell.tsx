"use client";

import { useCallback, useEffect, useState } from "react";
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

  const loadNotifications = useCallback(async () => {
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
      setNotifications(result.notifications ?? []);
      setUnreadCount(result.unreadCount ?? 0);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "通知を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadNotifications]);

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="通知を開く"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) void loadNotifications();
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
          {loading ? (
            <p className={styles.message}>読み込み中...</p>
          ) : error ? (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void loadNotifications()}>
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
