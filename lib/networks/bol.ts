import { addDays } from "@/lib/dates";
import { AdapterError, chunkRange, pick, requestJson, toIsoDate } from "@/lib/networks/http";
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
 * bol Affiliate Reporting API V2.
 *
 * Endpoints en veldnamen komen uit de officiële OpenAPI-specificatie van bol
 * (api.bol.com/marketing/docs/affiliate-reports-api). Let op het pad: de
 * rapportage voor partners zit onder /marketing/affiliate/reports/v2, niet
 * onder /partner — dat laatste geeft met een geldig token een 403.
 */
const DEFAULT_TOKEN_URL = "https://login.bol.com/token";
const DEFAULT_BASE = "https://api.bol.com/marketing/affiliate/reports/v2";
const ORDER_REPORT = "/order-report";
const PROMOTION_REPORT = "/promotion-report";
/** Rustig aan met de periodelengte; de API documenteert geen maximum. */
const MAX_DAYS_PER_CALL = 31;
/** Zie fetchDailyStats: het promotierapport kent geen datum-as. */
const CLICK_DAYS = 7;

/** Eén regel uit het orderrapport, zoals de specificatie hem beschrijft. */
interface BolOrderItem {
  orderDateTime?: string;
  orderDate?: string;
  orderId?: string;
  orderItemId?: string;
  productTitle?: string;
  productId?: string;
  quantity?: number;
  siteName?: string;
  siteCode?: string;
  subId?: string;
  priceExclVat?: number;
  priceInclVat?: number;
  commissionPercentage?: number;
  commission?: number;
  status?: string;
  statusFinal?: boolean;
  approvedForPayment?: boolean;
}

function base(settings: Record<string, string>): string {
  return (settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * bol gebruikt OAuth2 client-credentials: client-id en secret worden ingewisseld
 * voor een bearer-token dat een uur geldig is.
 */
async function accessToken(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<string> {
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    throw new AdapterError("bol.com client-id of client-secret ontbreekt.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const url = `${settings.tokenUrl || DEFAULT_TOKEN_URL}?grant_type=client_credentials`;
  const payload = await requestJson<{ access_token?: string }>(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    label: "bol.com login",
  });
  if (!payload.access_token) {
    throw new AdapterError("bol.com gaf geen access-token terug.");
  }
  return payload.access_token;
}

function reportHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

/** De rapporten leveren `{ items: [...] }`. */
async function loadReport<T>(
  settings: Record<string, string>,
  token: string,
  path: string,
  from: Date,
  to: Date,
  label: string,
): Promise<T[]> {
  const params = new URLSearchParams({
    startDate: toIsoDate(from),
    endDate: toIsoDate(to),
  });
  const payload = await requestJson<{ items?: T[] }>(
    `${base(settings)}${path}?${params}`,
    { headers: reportHeaders(token), label, timeoutMs: 60_000 },
  );
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const token = await accessToken(ctx.credentials, ctx.settings);
  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];

  for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
    const items = await loadReport<BolOrderItem>(
      ctx.settings,
      token,
      ctx.settings.reportPath || ORDER_REPORT,
      chunk.from,
      chunk.to,
      "bol.com orderrapport",
    );
    for (const item of items) {
      const mapped = mapOrderItem(item, ctx.settings);
      if (mapped) transactions.push(mapped);
    }
  }

  return {
    transactions,
    dailyStats: await fetchDailyStats(ctx, token, warnings),
    warnings,
  };
}

function mapOrderItem(
  item: BolOrderItem,
  settings: Record<string, string>,
): NormalisedTransaction | null {
  const row = item as unknown as Record<string, unknown>;

  // orderItemId is de fijnste eenheid: één order kan meerdere producten hebben.
  const externalId = String(
    pick(row, "orderItemId", "orderId") ?? "",
  ).trim();
  const occurredAt = parseDate(pick(row, "orderDateTime", "orderDate"));
  if (!externalId || !occurredAt) return null;

  const quantity = Math.max(1, Math.round(parseAmount(pick(row, "quantity")) || 1));
  // priceInclVat is de prijs per stuk; met quantity erbij is dat de orderwaarde.
  const unitPrice = parseAmount(pick(row, "priceInclVat", "priceExclVat"));

  // Alleen sites die je wilt volgen, als je dat hebt ingevuld.
  const siteFilter = settings.siteId?.trim();
  if (siteFilter) {
    const allowed = siteFilter.split(/[,\s;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const site = String(pick(row, "siteCode", "siteName") ?? "").toLowerCase();
    if (allowed.length > 0 && site && !allowed.includes(site)) return null;
  }

  return {
    externalId,
    occurredAt,
    status: mapStatus(item),
    currency: "EUR",
    commission: parseAmount(pick(row, "commission")),
    saleAmount: unitPrice * quantity,
    programId: optionalString(pick(row, "productId")),
    // Per product groeperen is voor bol.com nuttiger dan per programma: je ziet
    // welke artikelen je geld opleveren.
    programName:
      optionalString(pick(row, "productTitle")) ??
      optionalString(pick(row, "siteName")) ??
      "bol.com",
    countryCode: "NL",
  };
}

/**
 * bol geeft naast een tekstuele status ook twee vlaggen. Die zijn eenduidiger
 * dan de tekst, dus die gaan voor.
 */
function mapStatus(item: BolOrderItem): TransactionStatus {
  if (item.approvedForPayment === true) return "approved";
  if (item.statusFinal === true && item.approvedForPayment === false) return "rejected";
  return normaliseStatus(item.status);
}

/**
 * Clicks en impressies komen uit het promotierapport. Dat kent geen datum-as —
 * het geeft een totaal over de opgevraagde periode — dus voor dagcijfers is één
 * aanroep per dag nodig. Daarom staat dit uit tenzij je het aanzet, en dan
 * hoogstens over de laatste week.
 */
async function fetchDailyStats(
  ctx: AdapterContext,
  token: string,
  warnings: string[],
): Promise<NormalisedDailyStat[]> {
  if (ctx.settings.fetchClicks !== "ja") return [];

  const stats: NormalisedDailyStat[] = [];
  const lastDay = toIsoDate(ctx.range.to);

  try {
    for (let back = 0; back < CLICK_DAYS; back += 1) {
      const day = addDays(lastDay, -back);
      const date = new Date(`${day}T12:00:00Z`);
      const items = await loadReport<Record<string, unknown>>(
        ctx.settings,
        token,
        PROMOTION_REPORT,
        date,
        date,
        "bol.com promotierapport",
      );
      const entry: NormalisedDailyStat = { day, impressions: 0, clicks: 0, sales: 0 };
      for (const item of items) {
        entry.impressions += Math.round(parseAmount(pick(item, "impressions")));
        entry.clicks += Math.round(parseAmount(pick(item, "clicks")));
        entry.sales += Math.round(parseAmount(pick(item, "orders")));
      }
      stats.push(entry);
    }
  } catch (error) {
    warnings.push(
      `Clicks en impressies van bol.com konden niet worden opgehaald (${
        error instanceof Error ? error.message : "onbekende fout"
      }). Commissies zijn wel bijgewerkt.`,
    );
  }
  return stats;
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  const token = await accessToken(ctx.credentials, ctx.settings);

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  try {
    const items = await loadReport<BolOrderItem>(
      ctx.settings,
      token,
      ctx.settings.reportPath || ORDER_REPORT,
      from,
      to,
      "bol.com orderrapport",
    );

    const sites = new Set(
      items.map((item) => item.siteName).filter((name): name is string => Boolean(name)),
    );
    const details: Record<string, string> = {};
    for (const site of [...sites].slice(0, 10)) details[site] = "";

    return {
      ok: true,
      message: items.length
        ? `Verbonden. ${items.length} orderregel(s) over de laatste 30 dagen${
            sites.size > 0 ? `, van ${sites.size} site(s)` : ""
          }.`
        : "Verbonden, maar het orderrapport was leeg over de laatste 30 dagen.",
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    if (message.includes("403")) {
      return {
        ok: false,
        message:
          "Inloggen bij bol.com lukt, maar het orderrapport geeft 403. Meestal betekent dat je API-toegang nog niet is vrijgegeven voor het partnerprogramma — vraag dat aan via je affiliate-account (Handleiding toegang API). " +
          message,
      };
    }
    return { ok: false, message };
  }
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const bolAdapter: NetworkAdapter = {
  id: "bol",
  name: "bol.com",
  docsUrl: "https://api.bol.com/marketing/docs/affiliate-reports-api/index.html",
  credentialsHelp:
    "Maak client-credentials aan in je bol.com affiliate-account (Handleiding toegang API). Werkt de verbindingstest wel maar het rapport niet, dan staat je API-toegang nog niet open — dat vraag je aan bij bol.",
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
    },
    {
      name: "siteId",
      label: "Alleen deze sites",
      type: "text",
      secret: false,
      required: false,
      help:
        "Optioneel. Vul de sitecode of sitenaam in om tot die site(s) te beperken; meerdere mag met een komma. Leeg laten haalt al je sites op.",
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
        "Het promotierapport van bol geeft een totaal over een periode, niet per dag. Voor dagcijfers is dus één aanroep per dag nodig; daarom hoogstens een week. Zonder dit werken je commissies en grafieken gewoon.",
    },
    {
      name: "reportPath",
      label: "Rapport-pad",
      type: "text",
      secret: false,
      required: false,
      placeholder: ORDER_REPORT,
      help: "Alleen aanpassen als bol je een ander rapport heeft gegeven.",
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
