import { PrismaD1 } from "@prisma/adapter-d1";

import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Eén database-laag voor twee omgevingen:
 *
 * - **Lokaal en op een Node-server**: het SQLite-bestand uit DATABASE_URL, via
 *   de better-sqlite3-adapter.
 * - **Op Cloudflare Workers**: de D1-binding `DB`. Workers hebben geen blijvend
 *   bestandssysteem, dus daar kan geen bestand staan; D1 is Cloudflares eigen
 *   SQLite.
 *
 * Prisma 7 werkt met driver adapters, dus er is geen native database-engine die
 * per platform moet kloppen. Dat is de reden dat deze opzet op Workers werkt.
 *
 * De client wordt lui opgebouwd bij het eerste gebruik, want de D1-binding
 * bestaat pas zodra er een request loopt — terwijl de rest van de app `prisma`
 * gewoon als module importeert.
 */

type D1Binding = ConstructorParameters<typeof PrismaD1>[0];

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

function onCloudflare(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"
  );
}

function createClient(): PrismaClient {
  const log: ("warn" | "error")[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  // Bewust require() en geen import: zo komt better-sqlite3 (een native module)
  // niet in de Workers-bundel terecht, en @opennextjs/cloudflare niet in een
  // Node-deploy. Met statische imports zou de bundler beide altijd meenemen.
  if (onCloudflare()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const openNext = require("@opennextjs/cloudflare") as typeof import("@opennextjs/cloudflare");

    const env = openNext.getCloudflareContext().env as unknown as { DB?: D1Binding };
    if (!env?.DB) {
      throw new Error(
        "De D1-binding 'DB' ontbreekt. Maak een D1-database aan en zet database_id in wrangler.jsonc (zie README).",
      );
    }
    return new PrismaClient({ adapter: new PrismaD1(env.DB), log });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlite = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");

  return new PrismaClient({
    adapter: new sqlite.PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? "file:./prisma/kasboek.db",
    }),
    log,
  });
}

/**
 * Proxy die de echte client pas maakt zodra er iets van gevraagd wordt. Zo
 * blijven alle bestaande `import { prisma }`-regels ongewijzigd werken.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    globalForPrisma.prismaClient ??= createClient();
    const value = Reflect.get(globalForPrisma.prismaClient, property, receiver);
    return typeof value === "function"
      ? value.bind(globalForPrisma.prismaClient)
      : value;
  },
});
