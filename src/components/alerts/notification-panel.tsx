"use client";

interface Notification {
  id: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  createdAt: string;
}

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function NotificationPanel({
  notifications,
  onMarkAsRead,
  onMarkAllRead,
  onClose,
}: NotificationPanelProps) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-card-border rounded-xl shadow-lg z-50 max-h-[70vh] flex flex-col">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground">通知</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            全部已讀
          </button>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors p-0.5"
            aria-label="關閉通知面板"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 通知列表 */}
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            沒有通知
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => onMarkAsRead(n.id)}
              className={`w-full text-left px-4 py-3 border-b border-card-border last:border-b-0 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                n.read ? "opacity-50" : ""
              }`}
            >
              {/* 嚴重程度色點 */}
              <span
                className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
                  severityDot[n.severity] ?? "bg-gray-400"
                }`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {n.title}
                  </p>
                  {/* 未讀藍點 */}
                  {!n.read && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5 line-clamp-2">
                  {n.message}
                </p>
                <p className="text-xs text-muted mt-1">
                  {new Date(n.createdAt).toLocaleString("zh-TW")}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
