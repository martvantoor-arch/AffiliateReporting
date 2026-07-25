import { XMLParser } from "fast-xml-parser";

import { prisma } from "@/lib/db";
import { request } from "@/lib/networks/http";

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** 1 EUR = rate CUR. EUR staat er zelf ook in, op 1. */
export type RateTable = Map<string, number>;

let memo: { table: RateTable; at: number } | null = null;

/**
 * Wisselkoersen van de ECB, gecached in de database. Netwerken rapporteren in
 * hun eigen valuta; wij zetten alles om naar euro zodat totalen optelbaar zijn.
 */
export async function getRates(): Promise<RateTable> {
  if (memo && Date.now() - memo.at < MAX_AGE_MS) return memo.table;

  const stored = await prisma.fxRate.findMany();
  const freshEnough =
    stored.length > 0 &&
    stored.every((row) => Date.now() - row.fetchedAt.getTime() < MAX_AGE_MS);

  if (freshEnough) {
    const table = toTable(stored.map((r) => [r.currency, r.rate]));
    memo = { table, at: Date.now() };
    return table;
  }

  try {
    const fetched = await fetchEcbRates();
    await prisma.$transaction(
      fetched.map(([currency, rate]) =>
        prisma.fxRate.upsert({
          where: { currency },
          create: { currency, rate, fetchedAt: new Date() },
          update: { rate, fetchedAt: new Date() },
        }),
      ),
    );
    const table = toTable(fetched);
    memo = { table, at: Date.now() };
    return table;
  } catch {
    // Geen internet of ECB down: liever verouderde koersen dan geen totalen.
    const table = toTable(stored.map((r) => [r.currency, r.rate]));
    memo = { table, at: Date.now() };
    return table;
  }
}

async function fetchEcbRates(): Promise<[string, number][]> {
  const response = await request(ECB_URL, {
    label: "ECB wisselkoersen",
    headers: { accept: "application/xml" },
    timeoutMs: 15_000,
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
  });
  const parsed = parser.parse(await response.text()) as unknown;
  const rates: [string, number][] = [];
  collectCubes(parsed, rates);
  return rates;
}

function collectCubes(node: unknown, out: [string, number][], depth = 0): void {
  if (depth > 10 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectCubes(item, out, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  const currency = record["@currency"];
  const rate = record["@rate"];
  if (typeof currency === "string" && rate !== undefined) {
    const value = Number.parseFloat(String(rate));
    if (Number.isFinite(value) && value > 0) out.push([currency.toUpperCase(), value]);
  }
  for (const value of Object.values(record)) collectCubes(value, out, depth + 1);
}

function toTable(pairs: [string, number][]): RateTable {
  const table: RateTable = new Map([["EUR", 1]]);
  for (const [currency, rate] of pairs) {
    if (rate > 0) table.set(currency.toUpperCase(), rate);
  }
  return table;
}

/**
 * Zet een bedrag om naar euro. Onbekende valuta wordt onveranderd
 * doorgegeven — beter een bedrag met een kleine afwijking dan een nul die
 * omzet laat verdwijnen.
 */
export function toEur(amount: number, currency: string, rates: RateTable): number {
  const code = currency.toUpperCase();
  if (code === "EUR") return round2(amount);
  const rate = rates.get(code);
  if (!rate || rate <= 0) return round2(amount);
  return round2(amount / rate);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
