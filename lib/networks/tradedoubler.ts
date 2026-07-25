import { parseCsvObjects } from "@/lib/csv";
import { AdapterError, chunkRange, pick, request, toIsoDate, truncate } from "@/lib/networks/http";
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

const DEFAULT_BASE = "https://reports.tradedoubler.com";
const DEFAULT_PATH = "/pan/aOpenReport12d.json";
const DEFAULT_REPORT = "aff_transaction_report_v_2";
const PAGE_SIZE = 1000;
// Zie daisycon.ts: begrensd vanwege de requestlimiet op Workers.
const MAX_PAGES = 20;
const MAX_DAYS_PER_CALL = 92;

function reportUrl(
  ctx: Omit<AdapterContext, "range">,
  chunk: { from: Date; to: Date },
  offset: number,
): string {
  const affiliateId = ctx.settings.affiliateId?.trim();
  const token = ctx.credentials.reportToken?.trim();
  if (!affiliateId) throw new AdapterError("TradeDoubler affiliate-id ontbreekt.");
  if (!token) throw new AdapterError("TradeDoubler report-token ontbreekt.");

  const base = (ctx.settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const path = ctx.settings.reportPath || DEFAULT_PATH;
  const params = new URLSearchParams({
    reportName: ctx.settings.reportName || DEFAULT_REPORT,
    affiliateId,
    token,
    startDate: toIsoDate(chunk.from),
    endDate: toIsoDate(chunk.to),
    pagingSize: String(PAGE_SIZE),
    pagingOffset: String(offset),
    columnDelimiter: ";",
  });
  if (ctx.settings.currencyId?.trim()) {
    params.set("currencyId", ctx.settings.currencyId.trim());
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}?${params}`;
}

async function loadRows(
  ctx: Omit<AdapterContext, "range">,
  chunk: { from: Date; to: Date },
  offset: number,
): Promise<Record<string, unknown>[]> {
  const url = reportUrl(ctx, chunk, offset);
  const response = await request(url, { label: "TradeDoubler", timeoutMs: 60_000 });
  const text = await response.text();
  if (!text.trim()) return [];

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("csv") || (!text.trimStart().startsWith("{") && !text.trimStart().startsWith("["))) {
    return parseCsvObjects(text) as unknown as Record<string, unknown>[];
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AdapterError(
      `TradeDoubler gaf een onleesbaar antwoord: ${truncate(text, 200)}`,
    );
  }
  return flattenReportRows(payload);
}

/**
 * TradeDoubler-rapporten komen in meerdere vormen terug: een platte array met
 * objecten, of een matrix met losse kolomnamen. We normaliseren beide naar
 * objecten met leesbare sleutels.
 */
export function flattenReportRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) return [];

  const columnNames = findStringArray(payload, ["columnNames", "columns", "header", "headers"]);
  const rowArray = findRowArray(payload);
  if (!rowArray) return [];

  return rowArray
    .map((row) => {
      if (isRecord(row) && !Array.isArray(row)) {
        const cells = row.columns ?? row.cells ?? row.values;
        if (Array.isArray(cells) && columnNames) {
          return zip(columnNames, cells);
        }
        return row;
      }
      if (Array.isArray(row) && columnNames) {
        return zip(columnNames, row);
      }
      return null;
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

function zip(names: string[], cells: unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  names.forEach((name, index) => {
    const cell = cells[index];
    record[name] = isRecord(cell) && "value" in cell ? cell.value : cell;
  });
  return record;
}

function findRowArray(payload: Record<string, unknown>, depth = 0): unknown[] | null {
  if (depth > 6) return null;
  for (const key of ["rows", "matrix", "data", "entries", "transactions", "items"]) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) return value;
    if (isRecord(value)) {
      const nested = findRowArray(value, depth + 1);
      if (nested) return nested;
    }
  }
  // Laatste redmiddel: de langste array met objecten in het antwoord.
  let best: unknown[] | null = null;
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some(isRecord)) {
      if (!best || value.length > best.length) best = value;
    } else if (isRecord(value)) {
      const nested = findRowArray(value, depth + 1);
      if (nested && (!best || nested.length > best.length)) best = nested;
    }
  }
  return best;
}

function findStringArray(
  payload: Record<string, unknown>,
  keys: string[],
  depth = 0,
): string[] | null {
  if (depth > 6) return null;
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      return value as string[];
    }
    if (Array.isArray(value) && value.every(isRecord)) {
      const names = (value as Record<string, unknown>[]).map((v) =>
        String(v.name ?? v.label ?? v.title ?? ""),
      );
      if (names.every(Boolean)) return names;
    }
  }
  for (const value of Object.values(payload)) {
    if (isRecord(value)) {
      const nested = findStringArray(value, keys, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];

  for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const rows = await loadRows(ctx, chunk, page * PAGE_SIZE);
      for (const row of rows) {
        const mapped = mapTransaction(row);
        if (mapped) transactions.push(mapped);
      }
      if (rows.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) {
        warnings.push(
          "TradeDoubler: paginalimiet bereikt, kies eventueel een kortere periode.",
        );
      }
    }
  }

  if (transactions.length === 0) {
    warnings.push(
      "TradeDoubler leverde geen transactieregels op. Controleer de rapportnaam bij de instellingen als je wel omzet verwacht.",
    );
  }
  return { transactions, dailyStats: [], warnings };
}

function mapTransaction(row: Record<string, unknown>): NormalisedTransaction | null {
  const externalId = String(
    pick(row, "transactionId", "eventId", "conversionId", "id", "orderNumber") ?? "",
  ).trim();
  const occurredAt = parseDate(
    pick(row, "transactionTime", "transactionDate", "eventTime", "timeOfEvent", "date"),
  );
  if (!externalId || !occurredAt) return null;

  return {
    externalId,
    occurredAt,
    status: normaliseStatus(
      pick(row, "transactionStatus", "status", "pendingStatus", "approvalStatus"),
    ),
    currency: normaliseCurrency(pick(row, "currency", "currencyCode")),
    commission: parseAmount(
      pick(row, "affiliateCommission", "commission", "publisherCommission", "revenue"),
    ),
    saleAmount: parseAmount(pick(row, "orderValue", "orderAmount", "saleAmount", "amount")),
    programId: optionalString(pick(row, "programId", "programID", "advertiserId")),
    programName: optionalString(pick(row, "programName", "program", "advertiserName")),
    countryCode: optionalString(pick(row, "country", "countryCode", "market")),
  };
}

async function testConnection(
  ctx: Omit<AdapterContext, "range">,
): Promise<TestResult> {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await loadRows(ctx, { from, to }, 0);
  return {
    ok: true,
    message: rows.length
      ? `Verbonden. ${rows.length} rapportregel(s) over de laatste 7 dagen.`
      : "Verbonden, maar het rapport was leeg over de laatste 7 dagen. Dat kan kloppen als er geen omzet was.",
  };
}

function optionalString(value: unknown): string | null {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text : null;
}

export const tradedoublerAdapter: NetworkAdapter = {
  id: "tradedoubler",
  name: "TradeDoubler",
  docsUrl: "https://dev.tradedoubler.com/",
  credentialsHelp:
    "In TradeDoubler: Rapporten → Open rapport-API. Daar vind je je affiliate-id en het report-token. De rapportnaam kun je hieronder aanpassen als jouw account een andere gebruikt.",
  maturity: "needs-verification",
  fields: [
    {
      name: "affiliateId",
      label: "Affiliate-id",
      type: "text",
      secret: false,
      required: true,
      placeholder: "1234567",
    },
    {
      name: "reportToken",
      label: "Report-token",
      type: "password",
      secret: true,
      required: true,
    },
    {
      name: "reportName",
      label: "Rapportnaam",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_REPORT,
      help: "Standaard het transactierapport. Aanpassen als TradeDoubler een andere naam noemt.",
    },
    {
      name: "currencyId",
      label: "Valuta-id",
      type: "text",
      secret: false,
      required: false,
      help: "Optioneel; laat leeg om de standaardvaluta van je account te gebruiken.",
    },
    {
      name: "baseUrl",
      label: "API-basis-URL",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_BASE,
    },
    {
      name: "reportPath",
      label: "Rapport-pad",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_PATH,
    },
  ],
  fetchTransactions,
  testConnection,
};
