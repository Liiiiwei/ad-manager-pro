import type { MetadataRoute } from "next";

/** PWA manifest — 手機「加入主畫面」後直接開 /daily */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ad Manager Pro",
    short_name: "AdManager",
    description: "廣告帳戶每日摘要與異常監控",
    start_url: "/daily",
    display: "standalone",
    // 對齊 globals.css 的 --background token
    background_color: "#f1f5f9",
    // 對齊 globals.css 的 --accent token（品牌靛）
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
