import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isAuthBypassEnabled } from "@/lib/auth/env";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // 缺 Clerk 金鑰時：本機／開發或 LOCAL_NO_AUTH=true 放行；正式站回 503 擋未授權
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
