import { PrismaClient } from '@prisma/client';

/**
 * A singleton instance of the Prisma Client.
 * This should be used throughout the application to interact with the database.
 */
const prisma = new PrismaClient();

export default prisma;
