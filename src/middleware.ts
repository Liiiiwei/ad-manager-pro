import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAuthBypassEnabled } from "@/lib/auth/env";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

// 缺 Clerk 金鑰且啟用免驗證放行時（本機原生 App／開發）：模組載入時就不呼叫 clerkMiddleware。
// 原因：next start 下 NODE_ENV=production，clerkMiddleware 內部 assertKey 會在使用者 callback 之前
// 對缺金鑰拋錯，令每個路由回 500。改由模組層級判斷，缺金鑰且 bypass 生效時整個略過 Clerk。
// 正式站（有金鑰）不受影響，照走原本的 clerkMiddleware 保護邏輯。
const bypassWithoutKey =
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && isAuthBypassEnabled();

export default bypassWithoutKey
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, request) => {
      // 有金鑰但仍缺值的防呆：本機／開發或 LOCAL_NO_AUTH=true 放行；正式站回 503 擋未授權
      if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
        if (!isAuthBypassEnabled()) {
          return new Response("Service misconfigured", { status: 503 });
        }
        return;
      }

      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
