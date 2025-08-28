import { PrismaClient } from '@prisma/client';
import { withTimeout } from './utils';
import { env } from './env';

let prisma: PrismaClient | null = null;
let connected = false;

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
  const client = getPrisma();
  const maxRetries = env.DB_CONNECT_MAX_RETRIES ?? 5;
  const baseDelay = env.DB_CONNECT_BASE_DELAY_MS ?? 2000;
  const perTryTimeout = env.DB_CONNECT_TIMEOUT_MS ?? timeoutMs;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await withTimeout(client.$connect(), perTryTimeout, undefined, 'prisma.$connect');
      connected = true;
      return true;
    } catch (e: any) {
      const isLast = attempt === maxRetries;
      const delay = Math.round(baseDelay * Math.pow(1.5, attempt) + Math.random() * 250);
      if (isLast) {
        return false;
      }
      // eslint-disable-next-line no-console
      console.warn(`[prisma] connect failed (attempt ${attempt + 1}/${maxRetries + 1}): ${e?.code ?? ''} ${e?.message ?? e}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}
