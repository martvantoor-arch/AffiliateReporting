export const NETWORK_IDS = [
  "daisycon",
  "tradetracker",
  "tradedoubler",
  "bol",
  "awin",
] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

export function isNetworkId(value: string): value is NetworkId {
  return (NETWORK_IDS as readonly string[]).includes(value);
}

/** Alle netwerken gebruiken hun eigen woorden; wij normaliseren naar deze drie. */
export type TransactionStatus = "pending" | "approved" | "rejected";

export interface NormalisedTransaction {
  /** Id van het netwerk zelf — basis voor idempotente upserts. */
  externalId: string;
  occurredAt: Date;
  status: TransactionStatus;
  currency: string;
  /** Commissie voor de publisher, in `currency`. */
  commission: number;
  /** Orderwaarde, in `currency`. 0 als het netwerk dit niet meldt. */
  saleAmount: number;
  programId?: string | null;
  programName?: string | null;
  countryCode?: string | null;
}

export interface NormalisedDailyStat {
  /** YYYY-MM-DD */
  day: string;
  impressions: number;
  clicks: number;
  sales: number;
}

export interface FetchRange {
  from: Date;
  to: Date;
}

export interface FetchResult {
  transactions: NormalisedTransaction[];
  dailyStats: NormalisedDailyStat[];
  /** Niet-fatale problemen die de gebruiker wel moet zien. */
  warnings: string[];
}

export interface TestResult {
  ok: boolean;
  message: string;
  /** Bijvoorbeeld gevonden publisher-/site-id's, om te helpen bij instellen. */
  details?: Record<string, string>;
}

export interface AdapterContext {
  credentials: Record<string, string>;
  settings: Record<string, string>;
  range: FetchRange;
  /** Tijdzone van de gebruiker, voor netwerken die dat als parameter willen. */
  timezone: string;
}

export type CredentialFieldType = "text" | "password" | "number" | "select";

export interface CredentialField {
  name: string;
  label: string;
  type: CredentialFieldType;
  /** Geheim → versleuteld opgeslagen. Anders in `settings` als platte JSON. */
  secret: boolean;
  required: boolean;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Alleen tonen als een ander veld deze waarde heeft. */
  showWhen?: { field: string; value: string };
}

export type AdapterMaturity = "verified" | "needs-verification";

export interface NetworkAdapter {
  id: NetworkId;
  name: string;
  /** Waar de gebruiker zijn sleutels vandaan haalt. */
  docsUrl: string;
  credentialsHelp: string;
  /**
   * Geeft aan of de veldnamen van deze API tegen een live account zijn
   * nagelopen. `needs-verification` betekent: structuur staat, maar controleer
   * de mapping bij de eerste sync.
   */
  maturity: AdapterMaturity;
  fields: CredentialField[];
  fetchTransactions(ctx: AdapterContext): Promise<FetchResult>;
  testConnection(ctx: Omit<AdapterContext, "range">): Promise<TestResult>;
}

/** Netwerken leveren zelden nette datums; dit vangt de gangbare varianten. */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Seconden of milliseconden sinds epoch.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // DD-MM-YYYY of DD/MM/YYYY (Nederlandse exports).
  const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = dmy;
    return new Date(
      Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss),
    );
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  // "YYYY-MM-DD HH:mm:ss" zonder tijdzone-aanduiding.
  const loose = raw.replace(" ", "T");
  const retry = new Date(loose.endsWith("Z") ? loose : `${loose}Z`);
  return Number.isNaN(retry.getTime()) ? null : retry;
}

/** Bedragen komen als "1.234,56", "1,234.56", "12.34" of gewoon als number. */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  let raw = value.trim().replace(/[^\d,.-]/g, "");
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Het laatste scheidingsteken is het decimaalteken.
    raw =
      lastComma > lastDot
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Komma is decimaalteken tenzij het duidelijk duizendtallen groepeert.
    raw = /,\d{3}$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normaliseStatus(raw: unknown): TransactionStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "pending";
  if (
    /^(approved|accepted|confirmed|validated|paid|payable|locked|closed|ok|active|1)$/.test(
      value,
    )
  ) {
    return "approved";
  }
  if (
    /^(rejected|declined|disapproved|denied|cancelled|canceled|deleted|refused|invalid|void|2)$/.test(
      value,
    )
  ) {
    return "rejected";
  }
  return "pending";
}

export function normaliseCurrency(raw: unknown, fallback = "EUR"): string {
  const value = String(raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(value)) return value;
  if (value === "€") return "EUR";
  if (value === "£") return "GBP";
  if (value === "$") return "USD";
  return fallback;
}
