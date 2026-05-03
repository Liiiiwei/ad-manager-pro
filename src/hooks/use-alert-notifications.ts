"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Notification {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  severity: string;
  read: boolean;
  createdAt: string;
  rule: { name: string; metric: string };
}

// 請求瀏覽器通知權限
function requestNotificationPermission() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// 發送瀏覽器通知
function sendBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.ico" });
}

export function useAlertNotifications(pollIntervalMs = 5 * 60 * 1000) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousUnreadRef = useRef(0);

  // 啟動時請求通知權限
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // 取得通知列表
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/notifications?limit=50");
      if (!res.ok) {
        setError("無法載入通知");
        return;
      }
      const json = await res.json();
      setError(null);
      setNotifications(json.notifications);
      setUnreadCount(json.unreadCount);

      // 有新的未讀通知時推送瀏覽器通知
      if (json.unreadCount > previousUnreadRef.current) {
        const newest = json.notifications.find((n: Notification) => !n.read);
        if (newest) {
          sendBrowserNotification(newest.title, newest.message);
        }
      }
      previousUnreadRef.current = json.unreadCount;
    } finally {
      setLoading(false);
    }
  }, []);

  // 觸發規則檢查（背景操作，靜默處理錯誤）
  // API Key 已改由 server-side 從 DB 讀取，前端不需傳送
  const triggerCheck = useCallback(async () => {
    try {
      await fetch("/api/alerts/check", {
        method: "POST",
      });
      // 檢查完後重新取得通知
      await fetchNotifications();
    } catch {
      // 背景操作，靜默處理錯誤
    }
  }, [fetchNotifications]);

  // 標記已讀（含樂觀更新與失敗回滾）
  const markAsRead = useCallback(
    async (id: string) => {
      // 保留原始狀態以便回滾
      const prevNotifications = notifications;
      const prevUnreadCount = unreadCount;

      // 樂觀更新
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const response = await fetch("/api/alerts/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!response.ok) {
          // 伺服器回應失敗，回滾樂觀更新
          setNotifications(prevNotifications);
          setUnreadCount(prevUnreadCount);
        }
      } catch {
        // 請求失敗，回滾樂觀更新
        setNotifications(prevNotifications);
        setUnreadCount(prevUnreadCount);
      }
    },
    [notifications, unreadCount],
  );

  // 全部標記已讀（含樂觀更新與失敗回滾）
  const markAllRead = useCallback(async () => {
    // 保留原始狀態以便回滾
    const prevNotifications = notifications;
    const prevUnreadCount = unreadCount;

    // 樂觀更新
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      const response = await fetch("/api/alerts/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!response.ok) {
        // 伺服器回應失敗，回滾樂觀更新
        setNotifications(prevNotifications);
        setUnreadCount(prevUnreadCount);
      }
    } catch {
      // 請求失敗，回滾樂觀更新
      setNotifications(prevNotifications);
      setUnreadCount(prevUnreadCount);
    }
  }, [notifications, unreadCount]);

  // 初次載入 + 定時輪詢
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      triggerCheck();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchNotifications, triggerCheck, pollIntervalMs]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllRead,
    triggerCheck,
    refetch: fetchNotifications,
  };
}
