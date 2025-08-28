/**
 * A simple utility function to pause execution for a specified amount of time.
 * @param ms The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified time.
 */
export const sleep = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));

export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void, label?: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<Promise<T>>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout?.(); } catch {}
          reject(new Error((label ? `${label}: ` : '') + `operation timed out after ${ms}ms`));
        }, ms);
      }) as Promise<T>,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
