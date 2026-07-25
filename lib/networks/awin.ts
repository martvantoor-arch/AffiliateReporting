import { addDays } from "@/lib/dates";
import { AdapterError, chunkRange, pick, requestJson, toNaiveIso } from "@/lib/networks/http";
import {
  normaliseCurrency,
  normaliseStatus,
  parseAmount,
  parseDate,
  type AdapterContext,
  type FetchResult,
  type NetworkAdapter,
  type NormalisedDailyStat,
  type NormalisedTransaction,
  type TestResult,
} from "@/lib/networks/types";

const DEFAULT_BASE = "https://api.awin.com";

/** Awin staat maximaal een maand per transactie-aanvraag toe. */
const MAX_DAYS_PER_CALL = 31;

interface AwinMoney {
  amount?: number | string;
  currency?: string;
}

interface AwinTransaction {
  id?: number | string;
  transactionDate?: string;
  commissionStatus?: string;
  commissionAmount?: AwinMoney;
  saleAmount?: AwinMoney;
  advertiserId?: number | string;
  advertiserName?: string;
  publisherId?: number | string;
  advertiserCountry?: string;
  [key: string]: unknown;
}

interface AwinAccount {
  accountId?: number | string;
  accountName?: string;
  accountType?: string;
}

function base(settings: Record<string, string>): string {
  return (settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

function authHeaders(credentials: Record<string, string>): HeadersInit {
  const token = credentials.apiToken?.trim();
  if (!token) throw new AdapterError("Awin API-token ontbreekt.");
  return { authorization: `Bearer ${token}` };
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const publisherId = ctx.settings.publisherId?.trim();
  if (!publisherId) throw new AdapterError("Awin publisher-id ontbreekt.");

  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];
  const headers = authHeaders(ctx.credentials);

  for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
    const params = new URLSearchParams({
      startDate: toNaiveIso(chunk.from),
      endDate: toNaiveIso(chunk.to),
      timezone: awinTimezone(ctx.timezone),
      dateType: "transaction",
    });
    const url = `${base(ctx.settings)}/publishers/${encodeURIComponent(publisherId)}/transactions/?${params}`;
    const rows = await requestJson<AwinTransaction[]>(url, {
      headers,
      label: "Awin",
    });
    if (!Array.isArray(rows)) {
      throw new AdapterError("Awin gaf een onverwacht antwoord op de transactie-aanvraag.");
    }
    for (const row of rows) {
      const mapped = mapTransaction(row);
      if (mapped) transactions.push(mapped);
    }
  }

  const dailyStats = await fetchDailyStats(ctx, headers, warnings);
  return { transactions, dailyStats, warnings };
}

function mapTransaction(row: AwinTransaction): NormalisedTransaction | null {
  const externalId = String(pick(row, "id", "transactionId") ?? "").trim();
  const occurredAt = parseDate(pick(row, "transactionDate", "clickDate"));
  if (!externalId || !occurredAt) return null;

  const commissionRaw = row.commissionAmount ?? {};
  const saleRaw = row.saleAmount ?? {};
  const currency = normaliseCurrency(
    commissionRaw.currency ?? saleRaw.currency ?? pick(row, "currency"),
  );

  return {
    externalId,
    occurredAt,
    // "deleted" telt bij Awin als afgewezen; normaliseStatus vangt dat.
    status: normaliseStatus(pick(row, "commissionStatus", "status")),
    currency,
    commission: parseAmount(commissionRaw.amount ?? pick(row, "commissionAmount")),
    saleAmount: parseAmount(saleRaw.amount ?? pick(row, "saleAmount")),
    programId: optionalString(pick(row, "advertiserId")),
    programName: optionalString(pick(row, "advertiserName", "siteName")),
    countryCode: optionalString(pick(row, "advertiserCountry", "country")),
  };
}

/** Hoeveel dagen clicks we maximaal ophalen; zie fetchDailyStats. */
const CLICK_DAYS = 7;

/**
 * Clicks en impressies, als je die aanzet.
 *
 * Awin's rapportages geven een **totaal over een periode**, niet een reeks per
 * dag. Om toch dagcijfers te krijgen moet je het rapport één keer per dag
 * opvragen, en dat kost dus een aanroep per dag. Daarom staat dit uit tenzij je
 * het aanvinkt, en halen we hoogstens de laatste week op — genoeg voor de
 * tegels "per click" en "conversie", zonder je API-limiet op te eten.
 *
 * Mislukt het, dan is dat geen reden om de commissies weg te gooien: het wordt
 * een waarschuwing.
 */
async function fetchDailyStats(
  ctx: AdapterContext,
  headers: HeadersInit,
  warnings: string[],
): Promise<NormalisedDailyStat[]> {
  const publisherId = ctx.settings.publisherId?.trim();
  if (!publisherId) return [];
  if (ctx.settings.fetchClicks !== "ja") return [];

  // Awin eist een regio-lijst; zonder die parameter volgt HTTP 400
  // ("invalid region code list, expecting sth. like [FR,CA,DE]").
  const region = ctx.settings.region?.trim() || "NL";

  const stats: NormalisedDailyStat[] = [];
  const lastDay = toNaiveIso(ctx.range.to).slice(0, 10);
  const days: string[] = [];
  for (let back = 0; back < CLICK_DAYS; back += 1) {
    days.push(addDays(lastDay, -back));
  }

  try {
    for (const day of days) {
      const params = new URLSearchParams({
        startDate: day,
        endDate: day,
        region,
        timezone: awinTimezone(ctx.timezone),
        dateType: "transaction",
      });
      const url = `${base(ctx.settings)}/publishers/${encodeURIComponent(publisherId)}/reports/advertiser?${params}`;
      const rows = await requestJson<Record<string, unknown>[]>(url, {
        headers,
        label: "Awin rapportage",
      });
      if (!Array.isArray(rows)) continue;

      // Het rapport staat per adverteerder; wij tellen op naar één dagtotaal.
      const entry: NormalisedDailyStat = { day, impressions: 0, clicks: 0, sales: 0 };
      for (const row of rows) {
        entry.impressions += Math.round(parseAmount(pick(row, "impressions")));
        entry.clicks += Math.round(parseAmount(pick(row, "clicks")));
        entry.sales += Math.round(parseAmount(pick(row, "quantity", "sales", "transactionCount")));
      }
      stats.push(entry);
    }
  } catch (error) {
    warnings.push(
      `Clicks en impressies van Awin konden niet worden opgehaald (${
        error instanceof Error ? error.message : "onbekende fout"
      }). Commissies zijn wel bijgewerkt.`,
    );
  }
  return stats;
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  const headers = authHeaders(ctx.credentials);
  const accounts = await requestJson<{ accounts?: AwinAccount[] }>(
    `${base(ctx.settings)}/accounts`,
    { headers, label: "Awin" },
  );
  const list = accounts.accounts ?? [];
  const publishers = list.filter(
    (a) => String(a.accountType ?? "publisher").toLowerCase() === "publisher",
  );
  const details: Record<string, string> = {};
  for (const account of publishers.slice(0, 10)) {
    details[String(account.accountId)] = String(account.accountName ?? "");
  }
  const configured = ctx.settings.publisherId?.trim();
  if (configured && publishers.length > 0) {
    const match = publishers.some((a) => String(a.accountId) === configured);
    if (!match) {
      return {
        ok: false,
        message: `Token werkt, maar publisher-id ${configured} zit niet in dit account. Beschikbare id's: ${Object.keys(details).join(", ")}.`,
        details,
      };
    }
  }
  return {
    ok: true,
    message: publishers.length
      ? `Verbonden. ${publishers.length} publisher-account(s) gevonden.`
      : "Token werkt.",
    details,
  };
}

/** Awin wil een IANA-tijdzone uit een beperkte lijst; Europa valt goed uit. */
function awinTimezone(timezone: string): string {
  return timezone === "Europe/Amsterdam" ? "Europe/Berlin" : timezone;
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const awinAdapter: NetworkAdapter = {
  id: "awin",
  name: "Awin",
  docsUrl: "https://wiki.awin.com/index.php/API",
  credentialsHelp:
    "Maak een OAuth2-token aan via je Awin-account onder Gereedschap → API-credentials. Je publisher-id staat rechtsboven in het Awin-dashboard.",
  maturity: "verified",
  fields: [
    {
      name: "publisherId",
      label: "Publisher-id",
      type: "text",
      secret: false,
      required: true,
      placeholder: "123456",
      help: "Het numerieke id van je Awin-publisheraccount.",
    },
    {
      name: "apiToken",
      label: "API-token",
      type: "password",
      secret: true,
      required: true,
      help: "Het OAuth2-token uit Awin (Gereedschap → API-credentials).",
    },
    {
      name: "fetchClicks",
      label: "Clicks en impressies ophalen",
      type: "select",
      secret: false,
      required: false,
      options: [
        { value: "nee", label: "Nee (aanbevolen)" },
        { value: "ja", label: "Ja, laatste 7 dagen" },
      ],
      help:
        "Awin geeft clicks alleen als totaal over een periode, niet per dag. Voor dagcijfers is dus één aanroep per dag nodig; daarom hoogstens een week. Zonder dit werken je commissies en grafieken gewoon, alleen de tegels 'per click' en 'conversie' blijven leeg.",
    },
    {
      name: "region",
      label: "Regio",
      type: "text",
      secret: false,
      required: false,
      placeholder: "NL",
      help: "Landcode voor de rapportage, bijvoorbeeld NL of GB. Alleen nodig als je clicks ophaalt.",
      showWhen: { field: "fetchClicks", value: "ja" },
    },
    {
      name: "baseUrl",
      label: "API-basis-URL",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_BASE,
      help: "Alleen aanpassen als Awin je een ander endpoint heeft gegeven.",
    },
  ],
  fetchTransactions,
  testConnection,
};
