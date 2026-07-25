import { AdapterError, chunkRange, toIsoDate } from "@/lib/networks/http";
import {
  asText,
  collectNodes,
  findValue,
  SoapClient,
  type SoapValue,
} from "@/lib/networks/soap";
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

const DEFAULT_ENDPOINT = "https://ws.tradetracker.com/soap/affiliate";
const DEFAULT_NAMESPACE = "http://ws.tradetracker.com/soap/affiliate";
const MAX_DAYS_PER_CALL = 92;

async function connect(
  credentials: Record<string, string>,
  settings: Record<string, string>,
): Promise<SoapClient> {
  const customerId = credentials.customerId?.trim();
  const passphrase = credentials.passphrase?.trim();
  if (!customerId || !passphrase) {
    throw new AdapterError("TradeTracker customer-id of passphrase ontbreekt.");
  }

  const client = new SoapClient(
    settings.endpoint || DEFAULT_ENDPOINT,
    settings.namespace || DEFAULT_NAMESPACE,
    "TradeTracker",
  );
  await client.call("authenticate", {
    customerID: Number.parseInt(customerId, 10),
    passphrase,
    sandbox: false,
    locale: settings.locale || "nl_NL",
    demo: false,
  });
  return client;
}

interface AffiliateSite {
  id: string;
  name: string;
}

async function affiliateSites(
  client: SoapClient,
  settings: Record<string, string>,
): Promise<AffiliateSite[]> {
  const configured = settings.affiliateSiteId?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id, name: `Site ${id}` }));
  }

  const body = await client.call("getAffiliateSites");
  const nodes = collectNodes(body, ["affiliateSite", "item"]);
  const sites = nodes
    .map((node) => ({
      id: asText(findValue(node, "ID", "id", "affiliateSiteID")),
      name: asText(findValue(node, "name", "title")) || "Site",
    }))
    .filter((site) => site.id);

  // Zonder id's kunnen we niets opvragen; dat is een echte fout.
  if (sites.length === 0) {
    throw new AdapterError(
      "TradeTracker gaf geen affiliate-sites terug. Vul het site-id handmatig in bij de instellingen.",
    );
  }
  return sites;
}

async function fetchTransactions(ctx: AdapterContext): Promise<FetchResult> {
  const client = await connect(ctx.credentials, ctx.settings);
  const sites = await affiliateSites(client, ctx.settings);

  const transactions: NormalisedTransaction[] = [];
  const warnings: string[] = [];

  for (const site of sites) {
    for (const chunk of chunkRange(ctx.range.from, ctx.range.to, MAX_DAYS_PER_CALL)) {
      const body = await client.call("getConversionTransactions", {
        affiliateSiteID: Number.parseInt(site.id, 10),
        options: {
          registrationDateFrom: toIsoDate(chunk.from),
          registrationDateTo: toIsoDate(chunk.to),
        },
      });
      const nodes = collectNodes(body, ["conversionTransaction", "item"]);
      for (const node of nodes) {
        const mapped = mapTransaction(node, site);
        if (mapped) transactions.push(mapped);
      }
    }
  }

  return {
    transactions,
    dailyStats: await fetchDailyStats(client, ctx, sites, warnings),
    warnings,
  };
}

function mapTransaction(
  node: Record<string, SoapValue>,
  site: AffiliateSite,
): NormalisedTransaction | null {
  const externalId = asText(findValue(node, "ID", "transactionID", "conversionID"));
  const occurredAt = parseDate(
    asText(findValue(node, "registrationDate", "transactionDate", "date")),
  );
  if (!externalId || !occurredAt) return null;

  const campaignName = asText(findValue(node, "name", "campaignName"));
  const campaignId = asText(findValue(node, "campaignID", "campaignId"));

  return {
    externalId: `${site.id}:${externalId}`,
    occurredAt,
    status: normaliseStatus(
      asText(findValue(node, "assignmentStatus", "status", "transactionStatus")),
    ),
    currency: normaliseCurrency(asText(findValue(node, "currency", "currencyCode"))),
    commission: parseAmount(asText(findValue(node, "commission", "affiliateCommission"))),
    saleAmount: parseAmount(asText(findValue(node, "orderAmount", "amount", "revenue"))),
    programId: campaignId || null,
    programName: campaignName || null,
    countryCode: asText(findValue(node, "countryCode", "country")) || null,
  };
}

async function fetchDailyStats(
  client: SoapClient,
  ctx: AdapterContext,
  sites: AffiliateSite[],
  warnings: string[],
): Promise<NormalisedDailyStat[]> {
  const perDay = new Map<string, NormalisedDailyStat>();
  for (const site of sites) {
    try {
      const body = await client.call("getReportAffiliateSite", {
        affiliateSiteID: Number.parseInt(site.id, 10),
        options: {
          dateFrom: toIsoDate(ctx.range.from),
          dateTo: toIsoDate(ctx.range.to),
          dimension: "day",
        },
      });
      for (const node of collectNodes(body, ["report", "item", "reportData"])) {
        const day = parseDate(asText(findValue(node, "date", "day")))
          ?.toISOString()
          .slice(0, 10);
        if (!day) continue;
        const entry = perDay.get(day) ?? { day, impressions: 0, clicks: 0, sales: 0 };
        entry.impressions += Math.round(
          parseAmount(asText(findValue(node, "impressionCount", "impressions"))),
        );
        entry.clicks += Math.round(
          parseAmount(asText(findValue(node, "clickCount", "clicks"))),
        );
        entry.sales += Math.round(
          parseAmount(asText(findValue(node, "saleCount", "sales", "transactionCount"))),
        );
        perDay.set(day, entry);
      }
    } catch (error) {
      warnings.push(
        `Statistieken van TradeTracker-site ${site.id} konden niet worden opgehaald (${
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
  const client = await connect(ctx.credentials, ctx.settings);
  const body = await client.call("getAffiliateSites");
  const nodes = collectNodes(body, ["affiliateSite", "item"]);
  const details: Record<string, string> = {};
  for (const node of nodes.slice(0, 10)) {
    const id = asText(findValue(node, "ID", "affiliateSiteID"));
    if (id) details[id] = asText(findValue(node, "name", "title"));
  }
  return {
    ok: true,
    message: nodes.length
      ? `Verbonden. ${nodes.length} affiliate-site(s) gevonden.`
      : "Inloggen gelukt, maar er zijn geen sites gevonden. Vul het site-id handmatig in.",
    details,
  };
}

export const tradetrackerAdapter: NetworkAdapter = {
  id: "tradetracker",
  name: "TradeTracker",
  docsUrl: "https://affiliate.tradetracker.com/webService/",
  credentialsHelp:
    "In TradeTracker: Account → Webservice. Daar staan je customer-id en passphrase. Zet de webservice aan voordat je hem gebruikt.",
  maturity: "needs-verification",
  fields: [
    {
      name: "customerId",
      label: "Customer-id",
      type: "text",
      secret: true,
      required: true,
      placeholder: "123456",
    },
    {
      name: "passphrase",
      label: "Passphrase",
      type: "password",
      secret: true,
      required: true,
      help: "De webservice-passphrase, niet je gewone wachtwoord.",
    },
    {
      name: "affiliateSiteId",
      label: "Affiliate-site-id",
      type: "text",
      secret: false,
      required: false,
      placeholder: "Leeg laten = automatisch ophalen",
      help: "Meerdere id's mag je scheiden met een komma.",
    },
    {
      name: "locale",
      label: "Taal",
      type: "text",
      secret: false,
      required: false,
      placeholder: "nl_NL",
    },
    {
      name: "endpoint",
      label: "SOAP-endpoint",
      type: "text",
      secret: false,
      required: false,
      placeholder: DEFAULT_ENDPOINT,
    },
  ],
  fetchTransactions,
  testConnection,
};
