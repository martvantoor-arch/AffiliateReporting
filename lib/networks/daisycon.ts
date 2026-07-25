import { AdapterError, chunkRange, pick, request, requestJson, toIsoDate } from "@/lib/networks/http";
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

const DEFAULT_BASE = "https://services.daisycon.com";
const DEFAULT_TOKEN_URL = "https://login.daisycon.com/oauth/access-token";
const PER_PAGE = 500;
// Bewust laag gehouden: op Cloudflare Workers is het aantal uitgaande
// requests per aanroep begrensd (50 op het gratis plan).
const MAX_PAGES = 20;
const MAX_DAYS_PER_CALL = 92;

function base(settings: Record<string, string>): string {
  return (settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

/** Daisycon wil datums als "YYYY-MM-DD HH:II:SS", niet als losse datum. */
function startOfDayText(date: Date): string {
  return `${toIsoDate(date)} 00:00:00`;
}

function endOfDayText(date: Date): string {
  return `${toIsoDate(date)} 23:59:59`;
}

/**
 * Daisycon kent twee manieren van authenticeren. Basic auth met je
 * accountgegevens is het snelst in te stellen; OAuth2 met een refresh-token is
 * netter omdat je wachtwoord er niet in zit.
 */
async function authHeaders(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<HeadersInit> {
  const mode = settings.authMode || "basic";
  if (mode === "oauth") {
    const token = await accessToken(credentials, settings);
    return { authorization: `Bearer ${token}` };
  }
  const username = credentials.username?.trim();
  const password = credentials.password ?? "";
  if (!username || !password) {
    throw new AdapterError("Daisycon gebruikersnaam of wachtwoord ontbreekt.");
  }
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return { authorization: `Basic ${encoded}` };
}

async function accessToken(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<string> {
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  const refreshToken = credentials.refreshToken?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new AdapterError(
      "Voor OAuth2 heeft Daisycon een client-id, client-secret en refresh-token nodig.",
    );
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const response = await requestJson<{ access_token?: string }>(
    settings.tokenUrl || DEFAULT_TOKEN_URL,
    {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      label: "Daisycon login",
    },
  );
  if (!response.access_token) {
    throw new AdapterError("Daisycon gaf geen access-token terug.");
  }
  return response.access_token;
}

async function publisherIds(
  headers: HeadersInit,
  settings: Record<string, string>,
): Promise<string[]> {
  const configured = settings.publisherId?.trim();
  if (configured) {
    return configured.split(",").map((v) => v.trim()).filter(Boolean);
  }
  const rows = await requestJson<Record<string, unknown>[]>(
    `${base(settings)}/publishers`,
    { headers, label: "Daisycon" },
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => String(pick(row, "id", "publisher_id") ?? "").trim())
    .filter(Boolean);
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const headers = await authHeaders(ctx.credentials, ctx.settings);
  const ids = await publisherIds(headers, ctx.settings);
  if (ids.length === 0) {
    throw new AdapterError(
      "Geen Daisycon publisher-id gevonden. Vul er handmatig een in bij de instellingen.",
    );
  }

  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];

  for (const publisherId of ids) {
    for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        // Daisycon wil geen algemene start_date, maar een datumsoort met tijd
        // erin: "A valid start (click, approval or modified) date required
        // (YYYY-MM-DD HH:II:SS)". De namen zijn date_<soort>_start en
        // date_<soort>_end — niet start_<soort>_date, wat een eerdere poging
        // van mij was en dezelfde foutmelding opleverde. Welke soort is
        // instelbaar; zie het veld dateType hieronder.
        const kind = ctx.settings.dateType || "click";
        const params = new URLSearchParams({
          [`date_${kind}_start`]: startOfDayText(chunk.from),
          [`date_${kind}_end`]: endOfDayText(chunk.to),
          page: String(page),
          per_page: String(PER_PAGE),
        });
        // De spatie in de tijd moet als %20 over de lijn, niet als '+'.
        const query = params.toString().replace(/\+/g, "%20");
        const url = `${base(ctx.settings)}/publishers/${encodeURIComponent(publisherId)}/transactions?${query}`;
        const response = await request(url, { headers, label: "Daisycon" });
        const text = await response.text();
        const rows = safeJsonArray(text);

        for (const row of rows) {
          const mapped = mapTransaction(row, publisherId);
          if (mapped) transactions.push(mapped);
        }

        if (rows.length < PER_PAGE) break;
        if (page === MAX_PAGES) {
          warnings.push(
            `Daisycon publisher ${publisherId}: paginalimiet bereikt, mogelijk niet alles opgehaald. Kies een kortere periode.`,
          );
        }
      }
    }
  }

  return { transactions, dailyStats: await fetchDailyStats(ctx, headers, ids, warnings), warnings };
}

/**
 * Een Daisycon-transactie kan meerdere commissieregels bevatten. Die tellen we
 * op tot één regel per transactie, zodat een order niet dubbel meetelt.
 */
function mapTransaction(
  row: Record<string, unknown>,
  publisherId: string,
): NormalisedTransaction | null {
  const externalId = String(
    pick(row, "id", "transaction_id", "transactionId") ?? "",
  ).trim();
  const occurredAt = parseDate(
    pick(row, "date", "click_date", "created", "transaction_date"),
  );
  if (!externalId || !occurredAt) return null;

  const parts = Array.isArray(pick(row, "parts")) ? (pick(row, "parts") as Record<string, unknown>[]) : [];
  let commission = parseAmount(pick(row, "commission", "publisher_commission"));
  let saleAmount = parseAmount(pick(row, "revenue", "order_amount", "amount"));
  if (parts.length > 0) {
    commission = parts.reduce((sum, part) => sum + parseAmount(pick(part, "commission")), 0);
    saleAmount = parts.reduce((sum, part) => sum + parseAmount(pick(part, "revenue", "amount")), 0);
  }

  const status = normaliseStatus(
    pick(row, "status", "transaction_status") ??
      (parts.length > 0 ? pick(parts[0], "status") : undefined),
  );

  return {
    externalId: `${publisherId}:${externalId}`,
    occurredAt,
    status,
    currency: normaliseCurrency(pick(row, "currency_code", "currency")),
    commission,
    saleAmount,
    programId: optionalString(pick(row, "program_id", "programId", "campaign_id")),
    programName: optionalString(pick(row, "program_name", "programName", "campaign_name", "program")),
    countryCode: optionalString(pick(row, "country_code", "country")),
  };
}

async function fetchDailyStats(
  ctx: AdapterContext,
  headers: HeadersInit,
  ids: string[],
  warnings: string[],
): Promise<NormalisedDailyStat[]> {
  // Uit tenzij aangezet: het statistiekenpad van Daisycon is niet publiek
  // vastgelegd en gaf eerder een 404. Zonder dit werken je commissies gewoon.
  if (ctx.settings.fetchStats !== "ja") return [];

  const statsPath = ctx.settings.statsPath?.trim() || "statistics/date";

  const perDay = new Map<string, NormalisedDailyStat>();
  for (const publisherId of ids) {
    try {
      // Statistieken gebruiken start/end, niet start_date/end_date zoals de
      // transacties. Zie het veld statsPath als het pad bij jou anders is.
      const params = new URLSearchParams({
        start: startOfDayText(ctx.range.from),
        end: endOfDayText(ctx.range.to),
        per_page: "1000",
      });
      const query = params.toString().replace(/\+/g, "%20");
      const url = `${base(ctx.settings)}/publishers/${encodeURIComponent(publisherId)}/${statsPath}?${query}`;
      const response = await request(url, { headers, label: "Daisycon statistieken" });
      const rows = safeJsonArray(await response.text());
      for (const row of rows) {
        const day = parseDate(pick(row, "date", "day"))?.toISOString().slice(0, 10);
        if (!day) continue;
        const entry = perDay.get(day) ?? { day, impressions: 0, clicks: 0, sales: 0 };
        entry.impressions += Math.round(parseAmount(pick(row, "impressions", "views")));
        entry.clicks += Math.round(parseAmount(pick(row, "clicks")));
        entry.sales += Math.round(parseAmount(pick(row, "transactions", "sales", "leads")));
        perDay.set(day, entry);
      }
    } catch (error) {
      warnings.push(
        `Statistieken van Daisycon publisher ${publisherId} konden niet worden opgehaald (${
          error instanceof Error ? error.message : "onbekende fout"
        }).`,
      );
    }
  }
  return [...perDay.values()];
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  const headers = await authHeaders(ctx.credentials, ctx.settings);
  const rows = await requestJson<Record<string, unknown>[]>(
    `${base(ctx.settings)}/publishers`,
    { headers, label: "Daisycon" },
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      message: "Inloggen lukte, maar er zijn geen publisher-accounts gevonden.",
    };
  }
  const details: Record<string, string> = {};
  for (const row of rows.slice(0, 10)) {
    details[String(pick(row, "id") ?? "?")] = String(pick(row, "name", "company") ?? "");
  }
  return {
    ok: true,
    message: `Verbonden. ${rows.length} publisher-account(s) gevonden.`,
    details,
  };
}

function safeJsonArray(text: string): Record<string, unknown>[] {
  if (!text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AdapterError("Daisycon gaf geen geldige JSON terug.");
  }
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object") {
    for (const key of ["data", "transactions", "results", "items"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [];
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const daisyconAdapter: NetworkAdapter = {
  id: "daisycon",
  name: "Daisycon",
  docsUrl: "https://developers.daisycon.com/",
  credentialsHelp:
    "Basic: je Daisycon-inloggegevens werken direct. OAuth2 is veiliger: maak een applicatie aan op developers.daisycon.com en gebruik client-id, secret en refresh-token.",
  maturity: "needs-verification",
  fields: [
    {
      name: "authMode",
      label: "Manier van inloggen",
      type: "select",
      secret: false,
      required: true,
      options: [
        { value: "basic", label: "Gebruikersnaam en wachtwoord" },
        { value: "oauth", label: "OAuth2 (client-id + refresh-token)" },
      ],
      help: "OAuth2 heeft de voorkeur omdat je wachtwoord dan niet opgeslagen wordt.",
    },
    {
      name: "username",
      label: "E-mailadres",
      type: "text",
      secret: true,
      required: false,
      showWhen: { field: "authMode", value: "basic" },
    },
    {
      name: "password",
      label: "Wachtwoord",
      type: "password",
      secret: true,
      required: false,
      showWhen: { field: "authMode", value: "basic" },
    },
    {
      name: "clientId",
      label: "Client-id",
      type: "text",
      secret: true,
      required: false,
      showWhen: { field: "authMode", value: "oauth" },
    },
    {
      name: "clientSecret",
      label: "Client-secret",
      type: "password",
      secret: true,
      required: false,
      showWhen: { field: "authMode", value: "oauth" },
    },
    {
      name: "refreshToken",
      label: "Refresh-token",
      type: "password",
      secret: true,
      required: false,
      showWhen: { field: "authMode", value: "oauth" },
    },
    {
      name: "publisherId",
      label: "Publisher-id",
      type: "text",
      secret: false,
      required: false,
      placeholder: "Leeg laten = automatisch ophalen",
      help: "Meerdere id's mag je scheiden met een komma.",
    },
    {
      name: "dateType",
      label: "Filteren op welke datum",
      type: "select",
      secret: false,
      required: false,
      options: [
        { value: "click", label: "Clickdatum (aanbevolen)" },
        { value: "approval", label: "Goedkeuringsdatum" },
        { value: "modified", label: "Laatst gewijzigd" },
      ],
      help:
        "Daisycon wil weten op welke datum je filtert. Clickdatum zet een transactie op de dag dat de bezoeker klikte; dat past bij de grafieken. 'Laatst gewijzigd' is handig als je vooral latere goedkeuringen wilt oppikken.",
    },
    {
      name: "fetchStats",
      label: "Clicks en impressies ophalen",
      type: "select",
      secret: false,
      required: false,
      options: [
        { value: "nee", label: "Nee (aanbevolen)" },
        { value: "ja", label: "Ja, proberen" },
      ],
      help:
        "Het statistiekenpad van Daisycon is niet publiek vastgelegd en gaf eerder een 404. Zonder dit werken je commissies en grafieken gewoon; alleen 'per click' en 'conversie' blijven leeg.",
    },
    {
      name: "statsPath",
      label: "Statistieken-pad",
      type: "text",
      secret: false,
      required: false,
      placeholder: "statistics/date",
      help: "Het pad achter /publishers/{id}/. Aanpassen als je weet welk pad jouw account gebruikt.",
      showWhen: { field: "fetchStats", value: "ja" },
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
