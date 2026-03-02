import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

/**
 * 取得當前使用者的資料庫記錄（自動建立如果不存在）
 */
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('未登入');
  }

  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error('無法取得使用者資訊');
  }

  // 確保使用者存在於資料庫中
  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { settings: true },
  });

  // 如果不存在，建立新使用者
  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        settings: { create: {} },
      },
      include: { settings: true },
    });
  }

  return user;
}
