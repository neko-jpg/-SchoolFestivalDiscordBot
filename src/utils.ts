/**
 * A simple utility function to pause execution for a specified amount of time.
 * @param ms The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified time.
 */
export const sleep = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));
