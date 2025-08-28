import { PrismaClient } from '@prisma/client';
import { withTimeout } from './utils';

let prisma: PrismaClient | null = null;

/**
 * Returns a singleton instance of the Prisma Client.
 * The instance is created on the first call.
 */
export default function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'minimal',
    });
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
  }
}

/**
 * Attempts to connect to the database with a timeout. Useful for early failure
 * and to avoid long hangs in constrained networks.
 */
export async function tryConnectPrisma(timeoutMs = 5000): Promise<boolean> {
  try {
    const client = getPrisma();
    await withTimeout(client.$connect(), timeoutMs, undefined, 'prisma.$connect');
    return true;
  } catch {
    return false;
  }
}
