import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";

// 標題用的展示字體（Bricolage Grotesque），有個性的一張臉
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

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
    <ClerkProvider>
      <html
        lang="zh-TW"
        className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
      >
        <body className="antialiased">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">{children}</main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
