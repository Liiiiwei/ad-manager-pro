import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("請設定 WEBHOOK_SECRET 環境變數");
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("錯誤：缺少 svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("錯誤：驗證 webhook 失敗", err);
    return new Response("錯誤：驗證失敗", { status: 400 });
  }

  const eventType = evt.type;

  // 處理使用者建立事件（使用 upsert 確保冪等性）
  if (eventType === "user.created") {
    const { id, email_addresses } = evt.data;

    try {
      await prisma.user.upsert({
        where: { clerkId: id },
        update: {
          email: email_addresses[0]?.email_address || "",
        },
        create: {
          clerkId: id,
          email: email_addresses[0]?.email_address || "",
          settings: { create: {} },
        },
      });
    } catch (error) {
      console.error("使用者建立失敗:", error);
      return new Response("使用者建立失敗", { status: 500 });
    }
  }

  // 處理使用者刪除事件（使用 deleteMany 確保冪等性）
  if (eventType === "user.deleted") {
    const { id } = evt.data;

    if (id) {
      try {
        await prisma.user.deleteMany({ where: { clerkId: id as string } });
      } catch (error) {
        console.error("使用者刪除失敗:", error);
        return new Response("使用者刪除失敗", { status: 500 });
      }
    }
  }

  return new Response("", { status: 200 });
}
