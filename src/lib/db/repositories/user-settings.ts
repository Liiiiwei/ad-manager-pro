import { prisma } from "@/lib/db/prisma";
import { UserSettings, Prisma } from "@prisma/client";

/**
 * 取得使用者設定
 */
export async function getUserSettings(
  userId: string,
): Promise<UserSettings | null> {
  return await prisma.userSettings.findUnique({
    where: { userId },
  });
}

/**
 * 更新使用者設定（部分更新）
 */
export async function updateUserSettings(
  userId: string,
  data: Prisma.UserSettingsUpdateInput,
): Promise<UserSettings> {
  return await prisma.userSettings.upsert({
    where: { userId },
    update: data,
    create: {
      ...(data as Prisma.UserSettingsUncheckedCreateInput),
      userId,
    },
  });
}
