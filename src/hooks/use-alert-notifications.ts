"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiKey } from "@/hooks/use-windsor-data";

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

  // 觸發規則檢查
  const triggerCheck = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    await fetch("/api/alerts/check", {
      method: "POST",
      headers: { "x-windsor-api-key": apiKey },
    });
    // 檢查完後重新取得通知
    await fetchNotifications();
  }, [fetchNotifications]);

  // 標記已讀
  const markAsRead = useCallback(async (id: string) => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // 全部標記已讀
  const markAllRead = useCallback(async () => {
    await fetch("/api/alerts/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

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
