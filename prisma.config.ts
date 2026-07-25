import path from "node:path";

import { defineConfig } from "prisma/config";

/**
 * Configuratie voor de Prisma-CLI (`prisma generate`, `prisma db push`,
 * `prisma studio`, `prisma migrate diff`).
 *
 * In Prisma 7 staat de databaseverbinding niet meer in schema.prisma. De CLI
 * werkt hier altijd tegen het lokale SQLite-bestand; Cloudflare D1 wordt niet
 * door de CLI beheerd maar met `wrangler d1 migrations apply` (zie README).
 */
const localUrl = process.env.DATABASE_URL ?? "file:./prisma/kasboek.db";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  // `prisma db push` en `prisma migrate` willen de URL rechtstreeks weten.
  datasource: {
    url: localUrl,
  },
});
