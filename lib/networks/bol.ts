import { parseCsvObjects } from "@/lib/csv";
import { AdapterError, chunkRange, pick, request, toIsoDate, truncate } from "@/lib/networks/http";
import { flattenReportRows } from "@/lib/networks/tradedoubler";
import {
  normaliseCurrency,
  normaliseStatus,
  parseAmount,
  parseDate,
  type AdapterContext,
  type FetchResult,
  type NetworkAdapter,
  type NormalisedTransaction,
  type TestResult,
} from "@/lib/networks/types";

const DEFAULT_TOKEN_URL = "https://login.bol.com/token";
const DEFAULT_BASE = "https://api.bol.com";
const DEFAULT_PATH = "/partner/transactions";
const DEFAULT_ACCEPT = "application/json";
const MAX_DAYS_PER_CALL = 31;

/**
 * bol.com gebruikt OAuth2 client-credentials, net als hun Retailer API: je
 * wisselt client-id en secret in voor een token dat een uur geldig is.
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
  const response = await request(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    label: "bol.com login",
  });
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new AdapterError("bol.com gaf geen access-token terug.");
  }
  return payload.access_token;
}

async function loadRows(
  ctx: Omit<AdapterContext, "range">,
  chunk: { from: Date; to: Date },
): Promise<Record<string, unknown>[]> {
  const token = await accessToken(ctx.credentials, ctx.settings);
  const base = (ctx.settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const path = ctx.settings.reportPath || DEFAULT_PATH;
  const params = new URLSearchParams({
    "start-date": toIsoDate(chunk.from),
    "end-date": toIsoDate(chunk.to),
  });
  if (ctx.settings.siteId?.trim()) params.set("site-id", ctx.settings.siteId.trim());

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}?${params}`;
  const response = await request(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: ctx.settings.acceptHeader || DEFAULT_ACCEPT,
    },
    label: "bol.com",
    timeoutMs: 60_000,
  });

  const text = await response.text();
  if (!text.trim()) return [];
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return parseCsvObjects(text) as unknown as Record<string, unknown>[];
  }
  try {
    return flattenReportRows(JSON.parse(text));
  } catch {
    throw new AdapterError(
      `bol.com gaf een onleesbaar antwoord: ${truncate(text, 200)}`,
    );
  }
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  // Standaard staat de API-route uit. bol.com heeft geen stabiel gedocumenteerd
  // rapportage-endpoint voor partners; met een geldig token gaf het pad HTTP
  // 403 "Unauthorized request". Dan is een rode fout bij elke sync alleen ruis,
  // terwijl de CSV-import wel werkt.
  if (ctx.settings.useApi !== "ja") {
    return {
      transactions: [],
      dailyStats: [],
      warnings: [
        "bol.com staat op CSV-import. Exporteer je transacties bij bol.com en upload ze onderaan deze pagina. Wil je toch de API proberen, zet dat dan aan bij dit account.",
      ],
    };
  }

  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];

  for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
    const rows = await loadRows(ctx, chunk);
    for (const row of rows) {
      const mapped = mapTransaction(row);
      if (mapped) transactions.push(mapped);
    }
  }

  if (transactions.length === 0) {
    warnings.push(
      "bol.com leverde geen regels op. Het partnerprogramma wisselt zijn API-pad wel eens; controleer het pad bij de instellingen of gebruik de CSV-import.",
    );
  }
  return { transactions, dailyStats: [], warnings };
}

function mapTransaction(row: Record<string, unknown>): NormalisedTransaction | null {
  const externalId = String(
    pick(row, "transactionId", "id", "orderId", "orderNumber", "referenceId") ?? "",
  ).trim();
  const occurredAt = parseDate(
    pick(row, "transactionDate", "orderDate", "date", "clickDate", "datum"),
  );
  if (!externalId || !occurredAt) return null;

  return {
    externalId,
    occurredAt,
    status: normaliseStatus(pick(row, "status", "transactionStatus", "state", "statuslabel")),
    currency: normaliseCurrency(pick(row, "currency", "currencyCode"), "EUR"),
    commission: parseAmount(
      pick(row, "commission", "commissionAmount", "vergoeding", "provisie", "earnings"),
    ),
    saleAmount: parseAmount(
      pick(row, "orderAmount", "saleAmount", "totalAmount", "omzet", "amount"),
    ),
    programId: optionalString(pick(row, "categoryId", "productGroupId")),
    programName:
      optionalString(pick(row, "categoryName", "productGroup", "categorie", "productTitle")) ??
      "bol.com",
    countryCode: optionalString(pick(row, "country", "countryCode")) ?? "NL",
  };
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  // De tokenwissel is het deel dat we met zekerheid kunnen valideren.
  await accessToken(ctx.credentials, ctx.settings);

  if (ctx.settings.useApi !== "ja") {
    return {
      ok: true,
      message:
        "Inloggen bij bol.com werkt. Dit account staat op CSV-import, dus er wordt niets via de API opgehaald — upload je export onderaan deze pagina.",
    };
  }

  try {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await loadRows(ctx, { from, to });
    return {
      ok: true,
      message: rows.length
        ? `Verbonden. ${rows.length} regel(s) over de laatste 7 dagen.`
        : "Inloggen gelukt en het rapport is bereikbaar, maar leeg over de laatste 7 dagen.",
    };
  } catch (error) {
    return {
      ok: false,
      message: `Inloggen bij bol.com lukt, maar het rapport-pad werkt niet: ${
        error instanceof Error ? error.message : "onbekende fout"
      } Pas het pad aan of gebruik de CSV-import.`,
    };
  }
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const bolAdapter: NetworkAdapter = {
  id: "bol",
  name: "bol.com",
  docsUrl: "https://api.bol.com/",
  credentialsHelp:
    "Maak client-credentials aan in je bol.com partneraccount. Let op: bol.com verandert zijn rapportage-endpoint af en toe. Werkt de API niet, gebruik dan de CSV-import — die is voor bol.com de meest betrouwbare route.",
  maturity: "needs-verification",
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
      name: "useApi",
      label: "Hoe halen we bol.com op",
      type: "select",
      secret: false,
      required: false,
      options: [
        { value: "nee", label: "CSV-import (aanbevolen)" },
        { value: "ja", label: "Via de API proberen" },
      ],
      help:
        "bol.com heeft geen stabiel gedocumenteerd rapportage-endpoint voor partners; met een geldig token gaf het pad HTTP 403. Daarom staat de API uit en gebruik je de CSV-import onderaan deze pagina. Weet je het juiste pad, zet de API dan aan en vul het hieronder in.",
    },
    {
      name: "siteId",
      label: "Site-id",
      type: "text",
      secret: false,
      required: false,
      help: "Optioneel, als je meerdere sites in je partneraccount hebt.",
      showWhen: { field: "useApi", value: "ja" },
    },
    {
      name: "reportPath",
      label: "Rapport-pad",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_PATH,
      help: "Het pad achter api.bol.com waar je transacties staan.",
      showWhen: { field: "useApi", value: "ja" },
    },
    {
      name: "acceptHeader",
      label: "Accept-header",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_ACCEPT,
      help: "bol.com versioneert via deze header, bijvoorbeeld application/vnd.partner.v1+json.",
      showWhen: { field: "useApi", value: "ja" },
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
