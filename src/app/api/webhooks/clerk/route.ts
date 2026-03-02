import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('請設定 WEBHOOK_SECRET 環境變數');
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('錯誤：缺少 svix headers', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('錯誤：驗證 webhook 失敗', err);
    return new Response('錯誤：驗證失敗', { status: 400 });
  }

  const eventType = evt.type;

  // 處理使用者建立事件
  if (eventType === 'user.created') {
    const { id, email_addresses } = evt.data;

    await prisma.user.create({
      data: {
        clerkId: id,
        email: email_addresses[0]?.email_address || '',
        settings: { create: {} },
      },
    });

    console.log(`✅ 使用者已建立: ${id}`);
  }

  // 處理使用者刪除事件
  if (eventType === 'user.deleted') {
    const { id } = evt.data;

    if (id) {
      await prisma.user.delete({ where: { clerkId: id as string } });
      console.log(`🗑️ 使用者已刪除: ${id}`);
    }
  }

  return new Response('', { status: 200 });
}
