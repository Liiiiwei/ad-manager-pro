# Ad Manager Pro

## 設計系統

完整規格見 [`DESIGN.md`](./DESIGN.md)。動 UI 前先讀。重點：

- **顏色一律用 token**（`bg-accent`、`text-muted`、`bg-info`…），**禁止**硬寫色票（`bg-blue-500`）。
- 品牌 / 動作色＝靛 `accent`；資訊提示＝藍 `info`，兩者不同色不可混用。
- 中性色維持冷 slate，勿改暖。
- 字體：內文 `font-sans`(Geist)、標題 `font-display`(Bricolage)、數字 `font-mono tabular-nums`(Geist Mono)。
- token 定義在 `src/app/globals.css`，字體載入在 `src/app/layout.tsx`。
