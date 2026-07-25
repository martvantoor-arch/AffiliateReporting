import type { NextConfig } from "next";

/**
 * De app wordt op twee manieren gebouwd:
 *
 * - `npm run build` — een gewone Node-server (eigen server, Docker, VPS).
 * - `npm run cf:build` — Cloudflare Workers, via OpenNext.
 *
 * Sinds Prisma 7 hoeft daar niets voor omgezet te worden: de client is
 * gegenereerde TypeScript en praat via een driver adapter met de database, dus
 * er is geen platformafhankelijke engine meer. Zie lib/db.ts voor de keuze
 * tussen het lokale SQLite-bestand en Cloudflare D1.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
