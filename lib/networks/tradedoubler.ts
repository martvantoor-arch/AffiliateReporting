import { AdapterError, chunkRange, pick, requestJson } from "@/lib/networks/http";
import {
  normaliseStatus,
  parseAmount,
  parseDate,
  type AdapterContext,
  type FetchResult,
  type NetworkAdapter,
  type NormalisedDailyStat,
  type NormalisedTransaction,
  type TestResult,
  type TransactionStatus,
} from "@/lib/networks/types";

/**
 * TradeDoubler Publisher Management API.
 *
 * Endpoints en veldnamen komen uit de API-blueprint van TradeDoubler zelf
 * (tradedoubler.docs.apiary.io). Let op de host: het oude
 * reports.tradedoubler.com bestaat niet meer — dat geeft geen HTTP-fout maar
 * een mislukte verbinding. Ook /pan/aReport3Key.action is opgeheven (404).
 */
const DEFAULT_BASE = "https://connect.tradedoubler.com";
const TOKEN_PATH = "/uaa/oauth/token";
const TRANSACTIONS_PATH = "/publisher/report/transactions";
const STATISTICS_PATH = "/publisher/report/statistics";
const SOURCES_PATH = "/publisher/sources";
/** Geen gedocumenteerd maximum; hetzelfde ruime blok als voorheen. */
const MAX_DAYS_PER_CALL = 92;
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

/** Eén transactieregel, zoals de blueprint hem beschrijft. */
interface TdTransaction {
  transactionId?: number | string;
  programId?: number | string;
  programName?: string;
  sourceId?: number | string;
  sourceName?: string;
  eventTypeId?: number;
  status?: string;
  timeOfTransaction?: string;
  timeOfCreate?: string;
  timeOfLastModified?: string;
  orderNumber?: string;
  leadNumber?: string;
  orderValue?: number;
  commission?: number;
  paid?: boolean;
}

/** De rapporten leveren `{ items, offset, limit, reportCurrencyCode }`. */
interface TdPage<T> {
  items?: T[];
  offset?: number;
  limit?: number;
  reportCurrencyCode?: string;
}

function base(settings: Record<string, string>): string {
  return (settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

/** TradeDoubler wil `20190101`, niet `2019-01-01`. */
export function toCompactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * OAuth2 met een dubbele sleutel: de client (id en secret) tekent het verzoek,
 * de gebruiker (naam en wachtwoord) bepaalt tot welk account je toegang krijgt.
 * Het bearer-token leeft een kwartier, dus we halen er één per synchronisatie.
 */
async function accessToken(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<string> {
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  const username = credentials.username?.trim();
  const password = credentials.password;

  if (!clientId || !clientSecret) {
    throw new AdapterError(
      "TradeDoubler client-id of client-secret ontbreekt. Die maak je aan onder Tools → API Info.",
    );
  }
  if (!username || !password) {
    throw new AdapterError(
      "TradeDoubler gebruikersnaam of wachtwoord ontbreekt; het bearer-token wordt op je account uitgegeven.",
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const payload = await requestJson<{ access_token?: string }>(
    `${base(settings)}${TOKEN_PATH}`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username,
        password,
      }).toString(),
      label: "TradeDoubler login",
    },
  );

  if (!payload.access_token) {
    throw new AdapterError("TradeDoubler gaf geen access-token terug.");
  }
  return payload.access_token;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

/**
 * De transactierapportage draait per bron. Zonder ingevulde bron vraagt de app
 * het account als geheel op; met meerdere bronnen wordt er per bron opgehaald,
 * omdat de API er maar één tegelijk accepteert.
 */
function sources(settings: Record<string, string>): (string | null)[] {
  const raw = settings.sourceId?.trim();
  if (!raw) return [null];
  const ids = raw.split(/[,\s;]+/).map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? ids : [null];
}

function currency(settings: Record<string, string>): string {
  return (settings.currencyCode?.trim() || "EUR").toUpperCase();
}

async function loadTransactions(
  ctx: Omit<AdapterContext, "range">,
  token: string,
  chunk: { from: Date; to: Date },
  sourceId: string | null,
  offset: number,
): Promise<TdPage<TdTransaction>> {
  const params = new URLSearchParams({
    fromDate: toCompactDate(chunk.from),
    toDate: toCompactDate(chunk.to),
    reportCurrencyCode: currency(ctx.settings),
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  if (sourceId) params.set("sourceId", sourceId);

  return requestJson<TdPage<TdTransaction>>(
    `${base(ctx.settings)}${TRANSACTIONS_PATH}?${params}`,
    { headers: authHeaders(token), label: "TradeDoubler transacties", timeoutMs: 60_000 },
  );
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const token = await accessToken(ctx.credentials, ctx.settings);
  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];
  const fallbackCurrency = currency(ctx.settings);

  for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
    for (const sourceId of sources(ctx.settings)) {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await loadTransactions(ctx, token, chunk, sourceId, page * PAGE_SIZE);
        const items = Array.isArray(result?.items) ? result.items : [];
        for (const item of items) {
          const mapped = mapTransaction(item, result.reportCurrencyCode || fallbackCurrency);
          if (mapped) transactions.push(mapped);
        }
        if (items.length < PAGE_SIZE) break;
        if (page === MAX_PAGES - 1) {
          warnings.push(
            "TradeDoubler: paginalimiet bereikt, kies eventueel een kortere periode.",
          );
        }
      }
    }
  }

  return {
    transactions,
    dailyStats: await fetchDailyStats(ctx, token, warnings),
    warnings,
  };
}

function mapTransaction(
  item: TdTransaction,
  currencyCode: string,
): NormalisedTransaction | null {
  const row = item as unknown as Record<string, unknown>;

  const externalId = String(pick(row, "transactionId") ?? "").trim();
  const occurredAt = parseDate(pick(row, "timeOfTransaction", "timeOfCreate"));
  if (!externalId || !occurredAt) return null;

  return {
    externalId,
    occurredAt,
    status: mapStatus(item),
    currency: currencyCode,
    commission: parseAmount(pick(row, "commission")),
    saleAmount: parseAmount(pick(row, "orderValue")),
    programId: optionalString(pick(row, "programId")),
    programName: optionalString(pick(row, "programName")),
    countryCode: null,
  };
}

/**
 * TradeDoubler zet de status in één letter: A(ccepted), P(ending), D(enied).
 * Alleen die letters, dus de algemene woordenlijst helpt hier niet.
 */
export function mapStatus(item: { status?: string }): TransactionStatus {
  switch (String(item.status ?? "").trim().toUpperCase()) {
    case "A":
      return "approved";
    case "D":
      return "rejected";
    case "P":
      return "pending";
    default:
      return normaliseStatus(item.status);
  }
}

/**
 * Anders dan bij Awin, Daisycon en bol geeft TradeDoubler wél een reeks per
 * dag: één aanroep met intervalType=day levert alle dagen in de periode. Daarom
 * staat dit hier gewoon aan.
 */
async function fetchDailyStats(
  ctx: AdapterContext,
  token: string,
  warnings: string[],
): Promise<NormalisedDailyStat[]> {
  if (ctx.settings.fetchClicks === "nee") return [];

  const perDay = new Map<string, NormalisedDailyStat>();

  try {
    for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
      for (const sourceId of sources(ctx.settings)) {
        const params = new URLSearchParams({
          intervalType: "day",
          reportType: "date",
          fromDate: toCompactDate(chunk.from),
          toDate: toCompactDate(chunk.to),
          reportCurrencyCode: currency(ctx.settings),
          offset: "0",
          limit: String(PAGE_SIZE),
        });
        if (sourceId) params.set("sourceId", sourceId);

        const result = await requestJson<TdPage<Record<string, unknown>>>(
          `${base(ctx.settings)}${STATISTICS_PATH}?${params}`,
          { headers: authHeaders(token), label: "TradeDoubler statistieken", timeoutMs: 60_000 },
        );

        for (const item of result?.items ?? []) {
          const date = parseDate(pick(item, "date"));
          if (!date) continue;
          const day = date.toISOString().slice(0, 10);
          const entry = perDay.get(day) ?? { day, impressions: 0, clicks: 0, sales: 0 };
          entry.impressions += Math.round(parseAmount(pick(item, "impressions")));
          entry.clicks += Math.round(parseAmount(pick(item, "clicks")));
          entry.sales += Math.round(parseAmount(pick(item, "sales")));
          perDay.set(day, entry);
        }
      }
    }
  } catch (error) {
    warnings.push(
      `Clicks en impressies van TradeDoubler konden niet worden opgehaald (${
        error instanceof Error ? error.message : "onbekende fout"
      }). Commissies zijn wel bijgewerkt.`,
    );
  }

  return [...perDay.values()];
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  const token = await accessToken(ctx.credentials, ctx.settings);

  // Eerst de bronnen: die laten meteen zien welke id's je kunt invullen.
  const details: Record<string, string> = {};
  const known: string[] = [];
  try {
    const list = await requestJson<{ id?: number | string; name?: string }[]>(
      `${base(ctx.settings)}${SOURCES_PATH}`,
      { headers: authHeaders(token), label: "TradeDoubler bronnen" },
    );
    for (const source of Array.isArray(list) ? list : []) {
      if (source?.id === undefined) continue;
      const id = String(source.id);
      known.push(id);
      details[source.name ? `${source.name} (${id})` : id] = "";
    }
  } catch {
    // Geen bronnenlijst is niet fataal; de transactietest hieronder telt.
  }

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = await loadTransactions(ctx, token, { from, to }, sources(ctx.settings)[0], 0);
  const count = Array.isArray(result?.items) ? result.items.length : 0;

  const configured = ctx.settings.sourceId?.trim()
    ? sources(ctx.settings).filter((id): id is string => id !== null)
    : [];
  const missing = known.filter((id) => configured.length > 0 && !configured.includes(id));

  let message = count
    ? `Verbonden. ${count} transactie(s) over de laatste 30 dagen.`
    : "Verbonden, maar er stonden geen transacties in de laatste 30 dagen. Dat kan kloppen bij een nieuw account.";
  if (missing.length > 0) {
    message += ` Let op: je haalt nu alleen bron ${configured.join(", ")} op, terwijl je account er meer heeft (${missing.join(", ")}).`;
  }

  return { ok: true, message, details };
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const tradedoublerAdapter: NetworkAdapter = {
  id: "tradedoubler",
  name: "TradeDoubler",
  docsUrl: "https://tradedoubler.docs.apiary.io/",
  credentialsHelp:
    "Maak een API-client aan in TradeDoubler onder Tools → API Info (publishers.tradedoubler.com/en/uaa/clients). Het client-secret zie je maar één keer. Daarnaast zijn je gewone inloggegevens nodig; die bepalen tot welk account het token toegang geeft.",
  maturity: "verified",
  fields: [
    {
      name: "clientId",
      label: "Client-id",
      type: "text",
      secret: true,
      required: true,
    },
    {
      name: "clientSecret",
      label: "Client-secret",
      type: "password",
      secret: true,
      required: true,
      help: "Wordt bij het aanmaken één keer getoond. Kwijt? Verwijder de client en maak een nieuwe.",
    },
    {
      name: "username",
      label: "Gebruikersnaam",
      type: "text",
      secret: true,
      required: true,
      help: "Het e-mailadres waarmee je bij TradeDoubler inlogt.",
    },
    {
      name: "password",
      label: "Wachtwoord",
      type: "password",
      secret: true,
      required: true,
    },
    {
      name: "sourceId",
      label: "Alleen deze bronnen",
      type: "text",
      secret: false,
      required: false,
      help:
        "Optioneel. Meerdere mag met een komma; er wordt dan per bron opgehaald, want de API accepteert er één tegelijk. Leeg laten pakt je hele account.",
    },
    {
      name: "currencyCode",
      label: "Rapportagevaluta",
      type: "text",
      secret: false,
      required: false,
      placeholder: "EUR",
      help: "ISO-code waarin TradeDoubler de bedragen teruggeeft.",
    },
    {
      name: "fetchClicks",
      label: "Clicks en impressies ophalen",
      type: "select",
      secret: false,
      required: false,
      options: [
        { value: "ja", label: "Ja (aanbevolen)" },
        { value: "nee", label: "Nee" },
      ],
      help:
        "TradeDoubler geeft een reeks per dag in één aanroep, dus dit kost vrijwel niets.",
    },
    {
      name: "baseUrl",
      label: "API-basis-URL",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_BASE,
    },
  ],
  fetchTransactions,
  testConnection,
};
