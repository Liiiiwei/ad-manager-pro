import { prisma } from '@/lib/db/prisma';
import { UserSettings, Prisma } from '@prisma/client';

/**
 * 取得使用者設定
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  return await prisma.userSettings.findUnique({
    where: { userId },
  });
}

/**
 * 更新使用者設定（部分更新）
 */
export async function updateUserSettings(
  userId: string,
  data: Prisma.UserSettingsUpdateInput
): Promise<UserSettings> {
  // 確保設定存在，如果不存在則建立
  const existing = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!existing) {
    return await prisma.userSettings.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  return await prisma.userSettings.update({
    where: { userId },
    data,
  });
}
