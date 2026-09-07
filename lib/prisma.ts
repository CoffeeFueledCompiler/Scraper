// Standard Next.js Prisma singleton — avoids opening a new connection pool
// on every hot-reload in dev.
//
// Prisma 7 moved connection URLs out of schema.prisma; the client now takes
// a driver adapter instead (matches the other project's Prisma 7 setup).
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Render Postgres requires SSL and its cert chain isn't in Node's default
// trust store, so full certificate verification fails; rejectUnauthorized:
// false is Render's own documented workaround for external connections —
// still encrypted, just not verifying the server's cert against a known CA.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
