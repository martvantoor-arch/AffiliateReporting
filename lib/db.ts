import { PrismaClient } from "@prisma/client";

// In development maakt hot-reload telkens een nieuwe client aan; die hergebruiken
// we via globalThis zodat de SQLite-verbindingen niet oplopen.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
