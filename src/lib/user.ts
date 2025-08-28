import { PrismaClient } from '@prisma/client';

/**
 * 確実に User レコードを存在させる（外部キー違反の防止）
 */
export async function ensureUser(prisma: PrismaClient, id: string, tag?: string) {
  await prisma.user.upsert({
    where: { id },
    update: { tag },
    create: { id, tag },
  });
}

/**
 * 複数ユーザーをまとめて ensure
 */
export async function ensureUsers(prisma: PrismaClient, users: { id: string; tag?: string }[]) {
  await Promise.all(users.map((u) => ensureUser(prisma, u.id, u.tag)));
}

