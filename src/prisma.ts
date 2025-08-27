import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

/**
 * Returns a singleton instance of the Prisma Client.
 * The instance is created on the first call.
 */
export default function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
