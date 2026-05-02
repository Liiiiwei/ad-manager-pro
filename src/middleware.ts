import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // 正式環境缺少 Clerk 金鑰時，回傳 503 避免未授權存取
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (process.env.NODE_ENV === "production") {
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
