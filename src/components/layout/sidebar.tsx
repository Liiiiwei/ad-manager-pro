"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "儀表板", icon: "chart" },
  { href: "/campaigns", label: "廣告活動", icon: "megaphone" },
  { href: "/ad-structure", label: "廣告架構", icon: "tree" },
  { href: "/alerts", label: "警示中心", icon: "bell" },
  { href: "/alerts/rules", label: "提醒規則", icon: "bellGear" },
  { href: "/settings", label: "設定", icon: "gear" },
];

const icons: Record<string, ReactNode> = {
  chart: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  megaphone: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
      />
    </svg>
  ),
  bell: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  ),
  bellGear: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M10.268 21a2 2 0 003.464 0M15 17H9m6 0h2.586a1 1 0 00.707-1.707l-.543-.543A2 2 0 0117.172 13.5V11a5 5 0 00-3.172-4.659V6a2 2 0 10-4 0v.341A5 5 0 007 11v2.5a2 2 0 01-.578 1.25l-.543.543A1 1 0 006.586 17H9"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M18.5 5.5l1.5 1.5m0 0l-1.5 1.5M20 7h-3"
      />
    </svg>
  ),
  tree: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v0a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 6zm0 0h-1.5m13.5 6a2.25 2.25 0 012.25-2.25H20.25a2.25 2.25 0 012.25 2.25v0a2.25 2.25 0 01-2.25 2.25H18a2.25 2.25 0 01-2.25-2.25zm0 0h-5.25m0 0V6m0 6v6m0 0h5.25m-5.25 0a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v0A2.25 2.25 0 016 15.75h2.25A2.25 2.25 0 0110.5 18z"
      />
    </svg>
  ),
  gear: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Logo 區域 */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg
              className="w-4.5 h-4.5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">
              Ad Manager Pro
            </h1>
            <p className="text-[10px] text-sidebar-text leading-tight">
              廣告數據優化工具
            </p>
          </div>
        </div>
      </div>

      {/* 導航連結 */}
      <nav className="flex-1 p-3 space-y-1">
        <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold text-sidebar-text/50 uppercase tracking-widest">
          主選單
        </p>
        {navItems.map((item) => {
          const isActive =
            item.href === "/alerts"
              ? pathname === "/alerts"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                isActive
                  ? "bg-accent/15 text-accent font-medium shadow-sm shadow-accent/10"
                  : "hover:bg-sidebar-hover text-sidebar-text hover:text-white"
              }`}
            >
              <span className={isActive ? "text-accent" : ""}>
                {icons[item.icon]}
              </span>
              {item.label}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 使用者區域 */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
          <span className="text-xs text-sidebar-text truncate">我的帳號</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* 手機版漢堡按鈕 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-sidebar-bg text-white shadow-lg"
        aria-label="開啟選單"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* 手機版遮罩 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 手機版側邊欄 */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar-bg text-sidebar-text flex flex-col transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* 桌面版側邊欄 */}
      <aside className="hidden lg:flex w-60 min-h-screen bg-sidebar-bg text-sidebar-text flex-col">
        {sidebarContent}
      </aside>
    </>
  );
}
