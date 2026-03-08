import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString(): string {
  const rawUrl = process.env.DATABASE_URL || '';

  // Prisma Accelerate 格式：解析出實際的 postgres:// URL
  if (rawUrl.startsWith('prisma+postgres://')) {
    try {
      const url = new URL(rawUrl);
      const apiKey = url.searchParams.get('api_key');
      if (apiKey) {
        const decoded = JSON.parse(Buffer.from(apiKey, 'base64').toString());
        return decoded.databaseUrl || rawUrl;
      }
    } catch {
      // 解析失敗，使用原始 URL
    }
  }

  return rawUrl;
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
