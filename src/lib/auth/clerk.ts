import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

const DEV_FALLBACK_ID = 'dev-local-user';

/**
 * 取得當前使用者的資料庫記錄（自動建立如果不存在）
 * 在本地開發未設定 Clerk 時，使用 fallback 使用者
 */
export async function getCurrentUser() {
  let userId: string | null = null;
  let email = '';

  try {
    const authResult = await auth();
    userId = authResult.userId;
  } catch {
    // Clerk 未設定，使用 fallback
  }

  if (userId) {
    const clerkUser = await currentUser();
    email = clerkUser?.emailAddresses[0]?.emailAddress || '';
  } else {
    // 開發環境 fallback
    if (process.env.NODE_ENV !== 'production') {
      userId = DEV_FALLBACK_ID;
      email = 'dev@localhost';
    } else {
      throw new Error('未登入');
    }
  }

  // 確保使用者存在於資料庫中
  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { settings: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: userId,
        email,
        settings: { create: {} },
      },
      include: { settings: true },
    });
  }

  return user;
}
