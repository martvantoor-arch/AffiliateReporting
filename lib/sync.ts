import { decryptJson } from "@/lib/crypto";
import { dayKey } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getRates, round2, toEur } from "@/lib/fx";
import { getAdapter } from "@/lib/networks";
import { AdapterError, truncate } from "@/lib/networks/http";
import type { FetchResult, NormalisedTransaction } from "@/lib/networks/types";

/** Standaard terugkijkperiode: netwerken passen transacties nog weken aan. */
export const DEFAULT_LOOKBACK_DAYS = 45;

export interface AccountSyncResult {
  accountId: string;
  network: string;
  label: string;
  ok: boolean;
  upserted: number;
  message: string;
  warnings: string[];
}

export interface SyncSummary {
  results: AccountSyncResult[];
  upserted: number;
  failed: number;
}

interface SyncOptions {
  lookbackDays?: number;
  accountIds?: string[];
  trigger?: "manual" | "cron" | "onboarding";
}

/**
 * Haalt bij alle actieve accounts van een gebruiker de recente transacties op.
 * Eén stuk netwerk dat kapot is mag de rest niet blokkeren, dus elke account
 * wordt apart afgehandeld en fouten worden per account vastgelegd.
 */
export async function syncUser(
  userId: string,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const {
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    accountIds,
    trigger = "manual",
  } = options;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Gebruiker niet gevonden.");

  const accounts = await prisma.networkAccount.findMany({
    where: {
      userId,
      enabled: true,
      ...(accountIds && accountIds.length > 0 ? { id: { in: accountIds } } : {}),
    },
    orderBy: { network: "asc" },
  });

  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const rates = await getRates();

  const results: AccountSyncResult[] = [];

  for (const account of accounts) {
    const run = await prisma.syncRun.create({
      data: {
        userId,
        accountId: account.id,
        network: account.network,
        status: "running",
        trigger,
      },
    });

    try {
      const adapter = getAdapter(account.network);
      const credentials = decryptJson<Record<string, string>>(account.credentials);
      const settings = JSON.parse(account.settings || "{}") as Record<string, string>;

      const fetched = await adapter.fetchTransactions({
        credentials,
        settings,
        range: { from, to },
        timezone: user.timezone,
      });

      const upserted = await persist(account.id, account.network, fetched, user.timezone, rates);
      const message = summarise(fetched, upserted);

      const status = fetched.warnings.length > 0 ? "partial" : "ok";
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status, itemsUpserted: upserted, message, finishedAt: new Date() },
      });
      await prisma.networkAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: status, lastSyncMessage: message },
      });

      results.push({
        accountId: account.id,
        network: account.network,
        label: account.label,
        ok: true,
        upserted,
        message,
        warnings: fetched.warnings,
      });
    } catch (error) {
      const message = errorMessage(error);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: "error", message, finishedAt: new Date() },
      });
      await prisma.networkAccount.update({
        where: { id: account.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          lastSyncMessage: message,
        },
      });

      results.push({
        accountId: account.id,
        network: account.network,
        label: account.label,
        ok: false,
        upserted: 0,
        message,
        warnings: [],
      });
    }
  }

  return {
    results,
    upserted: results.reduce((sum, r) => sum + r.upserted, 0),
    failed: results.filter((r) => !r.ok).length,
  };
}

async function persist(
  accountId: string,
  network: string,
  fetched: FetchResult,
  timezone: string,
  rates: Awaited<ReturnType<typeof getRates>>,
): Promise<number> {
  let count = 0;

  // Regel voor regel, niet in één transactie: Cloudflare D1 kent geen
  // transacties, dus die zouden daar stil uiteenvallen in losse queries. Omdat
  // het upserts zijn, is een half afgemaakte sync geen probleem — de volgende
  // ronde werkt dezelfde regels gewoon opnieuw bij.
  for (const transaction of fetched.transactions) {
    const data = toRow(accountId, network, transaction, timezone, rates);
    await prisma.transaction.upsert({
      where: {
        accountId_externalId: {
          accountId,
          externalId: transaction.externalId,
        },
      },
      create: data,
      // Status en bedragen veranderen bij het netwerk nog; die volgen we.
      update: {
        status: data.status,
        commission: data.commission,
        commissionEur: data.commissionEur,
        saleAmount: data.saleAmount,
        saleAmountEur: data.saleAmountEur,
        currency: data.currency,
        occurredAt: data.occurredAt,
        day: data.day,
        programId: data.programId,
        programName: data.programName,
        countryCode: data.countryCode,
      },
    });
    count += 1;
  }

  for (const stat of fetched.dailyStats) {
    await prisma.dailyStat.upsert({
      where: { accountId_day: { accountId, day: stat.day } },
      create: {
        accountId,
        network,
        day: stat.day,
        impressions: stat.impressions,
        clicks: stat.clicks,
        sales: stat.sales,
      },
      update: {
        impressions: stat.impressions,
        clicks: stat.clicks,
        sales: stat.sales,
      },
    });
  }

  return count;
}

function toRow(
  accountId: string,
  network: string,
  transaction: NormalisedTransaction,
  timezone: string,
  rates: Awaited<ReturnType<typeof getRates>>,
) {
  return {
    accountId,
    network,
    externalId: transaction.externalId,
    occurredAt: transaction.occurredAt,
    day: dayKey(transaction.occurredAt, timezone),
    status: transaction.status,
    currency: transaction.currency,
    commission: round2(transaction.commission),
    commissionEur: toEur(transaction.commission, transaction.currency, rates),
    saleAmount: round2(transaction.saleAmount),
    saleAmountEur: toEur(transaction.saleAmount, transaction.currency, rates),
    programId: transaction.programId ?? null,
    programName: transaction.programName ?? null,
    countryCode: transaction.countryCode ?? null,
  };
}

function summarise(fetched: FetchResult, upserted: number): string {
  const parts = [`${upserted} transactie(s) bijgewerkt`];
  if (fetched.dailyStats.length > 0) {
    parts.push(`${fetched.dailyStats.length} dag(en) statistieken`);
  }
  if (fetched.warnings.length > 0) {
    parts.push(fetched.warnings.join(" "));
  }
  return truncate(parts.join(". "), 400);
}

function errorMessage(error: unknown): string {
  if (error instanceof AdapterError) return truncate(error.message, 400);
  if (error instanceof Error) return truncate(error.message, 400);
  return "Onbekende fout tijdens het ophalen.";
}
