import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Ad Manager Pro",
  description: "廣告數據優化工具 — 每日自動分析與最佳化建議",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 flex flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
