"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guard";
import { parseCsvObjects } from "@/lib/csv";
import { decryptJson, encryptJson, sha256 } from "@/lib/crypto";
import { dayKey } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getRates, round2, toEur } from "@/lib/fx";
import { getAdapter } from "@/lib/networks";
import { pick, truncate } from "@/lib/networks/http";
import {
  isNetworkId,
  normaliseCurrency,
  normaliseStatus,
  parseAmount,
  parseDate,
} from "@/lib/networks/types";
import { syncUser } from "@/lib/sync";

export interface AccountActionState {
  error?: string;
  success?: string;
  /** Extra info uit een verbindingstest, bijvoorbeeld gevonden site-id's. */
  details?: Record<string, string>;
}

/** Blijft dit leeg, dan laten we de bestaande waarde staan bij het bewerken. */
const KEEP_EXISTING = "";

export async function saveAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await requireUser();

  const network = String(formData.get("network") ?? "");
  if (!isNetworkId(network)) return { error: "Onbekend netwerk." };

  const accountId = String(formData.get("accountId") ?? "").trim() || null;
  const label =
    String(formData.get("label") ?? "").trim() || getAdapter(network).name;

  const adapter = getAdapter(network);
  const credentials: Record<string, string> = {};
  const settings: Record<string, string> = {};

  const existing = accountId
    ? await prisma.networkAccount.findFirst({
        where: { id: accountId, userId: user.id },
      })
    : null;
  if (accountId && !existing) return { error: "Dit account bestaat niet (meer)." };

  const existingCredentials = existing
    ? decryptJson<Record<string, string>>(existing.credentials)
    : {};

  for (const field of adapter.fields) {
    const raw = String(formData.get(field.name) ?? "").trim();
    if (field.secret) {
      if (raw === KEEP_EXISTING) {
        // Bij bewerken laten we bestaande geheimen staan als het veld leeg blijft.
        if (existingCredentials[field.name]) {
          credentials[field.name] = existingCredentials[field.name];
        }
      } else {
        credentials[field.name] = raw;
      }
    } else if (raw !== KEEP_EXISTING) {
      settings[field.name] = raw;
    }
  }

  // Verplichte velden controleren op de samengestelde waarde, zodat een
  // ongewijzigd geheim niet als "ontbrekend" wordt gezien.
  for (const field of adapter.fields) {
    if (!field.required) continue;
    if (field.showWhen) {
      const controlling = settings[field.showWhen.field] ?? credentials[field.showWhen.field];
      if (controlling !== field.showWhen.value) continue;
    }
    const value = field.secret ? credentials[field.name] : settings[field.name];
    if (!value) return { error: `${field.label} is verplicht.` };
  }

  const data = {
    network,
    label,
    credentials: encryptJson(credentials),
    settings: JSON.stringify(settings),
  };

  try {
    if (existing) {
      await prisma.networkAccount.update({ where: { id: existing.id }, data });
    } else {
      await prisma.networkAccount.create({ data: { ...data, userId: user.id } });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return {
        error: `Je hebt al een ${adapter.name}-account met de naam "${label}". Kies een andere naam.`,
      };
    }
    throw error;
  }

  revalidatePath("/netwerken");
  revalidatePath("/");
  return { success: existing ? "Wijzigingen opgeslagen." : `${adapter.name} toegevoegd.` };
}

export async function testAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");

  const account = await prisma.networkAccount.findFirst({
    where: { id: accountId, userId: user.id },
  });
  if (!account) return { error: "Dit account bestaat niet (meer)." };

  try {
    const adapter = getAdapter(account.network);
    const result = await adapter.testConnection({
      credentials: decryptJson<Record<string, string>>(account.credentials),
      settings: JSON.parse(account.settings || "{}") as Record<string, string>,
      timezone: user.timezone,
    });
    return result.ok
      ? { success: result.message, details: result.details }
      : { error: result.message, details: result.details };
  } catch (error) {
    return {
      error: truncate(
        error instanceof Error ? error.message : "Onbekende fout tijdens de test.",
        400,
      ),
    };
  }
}

export async function toggleAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  const account = await prisma.networkAccount.findFirst({
    where: { id: accountId, userId: user.id },
  });
  if (!account) return;
  await prisma.networkAccount.update({
    where: { id: account.id },
    data: { enabled: !account.enabled },
  });
  revalidatePath("/netwerken");
  revalidatePath("/");
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "");
  // deleteMany met userId erin: zo kun je nooit iemand anders zijn account raken.
  await prisma.networkAccount.deleteMany({
    where: { id: accountId, userId: user.id },
  });
  revalidatePath("/netwerken");
  revalidatePath("/");
}

export async function syncNowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const lookback = Number.parseInt(String(formData.get("lookbackDays") ?? ""), 10);

  await syncUser(user.id, {
    accountIds: accountId ? [accountId] : undefined,
    lookbackDays: Number.isFinite(lookback) && lookback > 0 ? Math.min(lookback, 730) : undefined,
    trigger: "manual",
  });

  revalidatePath("/netwerken");
  revalidatePath("/");
}

/* ------------------------------------------------------------------ *
 * CSV-import — de terugvaloptie als een API niet meewerkt.
 * ------------------------------------------------------------------ */

const importSchema = z.object({
  network: z.string().refine(isNetworkId, "Onbekend netwerk."),
  accountId: z.string().min(1, "Kies een account om de regels aan te hangen."),
});

export async function importCsvAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await requireUser();

  const parsed = importSchema.safeParse({
    network: formData.get("network"),
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je keuzes." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Kies een CSV-bestand." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Dat bestand is groter dan 20 MB. Splits het op in delen." };
  }

  const account = await prisma.networkAccount.findFirst({
    where: { id: parsed.data.accountId, userId: user.id, network: parsed.data.network },
  });
  if (!account) return { error: "Dit account bestaat niet (meer)." };

  const rows = parseCsvObjects(await file.text());
  if (rows.length === 0) {
    return { error: "In dit bestand staan geen regels die ik kan lezen." };
  }

  const rates = await getRates();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    const occurredAt = parseDate(
      pick(record, "date", "datum", "transactionDate", "transactiedatum", "orderDate", "besteldatum"),
    );
    const commission = parseAmount(
      pick(record, "commission", "commissie", "vergoeding", "provisie", "earnings", "inkomsten"),
    );
    if (!occurredAt) {
      skipped += 1;
      continue;
    }

    const currency = normaliseCurrency(pick(record, "currency", "valuta"));
    const saleAmount = parseAmount(
      pick(record, "orderAmount", "omzet", "saleAmount", "orderwaarde", "amount", "bedrag"),
    );
    const externalIdRaw = pick(
      record,
      "transactionId",
      "transactienummer",
      "id",
      "orderId",
      "ordernummer",
      "reference",
    );
    // Zonder id maken we er zelf een uit de inhoud, zodat opnieuw importeren
    // van hetzelfde bestand geen dubbele regels oplevert.
    const externalId = externalIdRaw
      ? `csv:${String(externalIdRaw).trim()}`
      : `csv:${sha256(JSON.stringify([occurredAt.toISOString(), commission, saleAmount, JSON.stringify(row)])).slice(0, 24)}`;

    const day = dayKey(occurredAt, user.timezone);
    const base = {
      status: normaliseStatus(pick(record, "status", "state", "statuslabel")),
      currency,
      commission: round2(commission),
      commissionEur: toEur(commission, currency, rates),
      saleAmount: round2(saleAmount),
      saleAmountEur: toEur(saleAmount, currency, rates),
      occurredAt,
      day,
      programId: optionalString(pick(record, "programId", "programmaId", "advertiserId")),
      programName: optionalString(
        pick(record, "programName", "programma", "program", "advertiser", "adverteerder", "shop", "winkel"),
      ),
      countryCode: optionalString(pick(record, "country", "land", "countryCode")),
    };

    await prisma.transaction.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId } },
      create: {
        accountId: account.id,
        network: account.network,
        externalId,
        ...base,
      },
      update: base,
    });
    imported += 1;
  }

  await prisma.networkAccount.update({
    where: { id: account.id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncMessage: `CSV-import: ${imported} regel(s) verwerkt.`,
    },
  });

  revalidatePath("/netwerken");
  revalidatePath("/");

  return {
    success:
      skipped > 0
        ? `${imported} regel(s) geïmporteerd. ${skipped} regel(s) overgeslagen omdat er geen datum in stond.`
        : `${imported} regel(s) geïmporteerd.`,
  };
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}
