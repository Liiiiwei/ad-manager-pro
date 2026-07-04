// 從 src/app/icon.svg 產生 PWA 用 PNG 圖示（192 / 512）
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "src/app/icon.svg";

await mkdir("public", { recursive: true });

for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  await sharp(SRC, { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`已產生 ${out}`);
}
