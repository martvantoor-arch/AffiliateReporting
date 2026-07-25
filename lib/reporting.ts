import {
  bucketKey,
  dayRange,
  daysBetween,
  formatBucket,
  previousRange,
  resolvePreset,
  suggestGranularity,
  type DayRange,
  type Granularity,
} from "@/lib/dates";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/fx";
import { NETWORK_IDS, networkName, type NetworkId } from "@/lib/networks/meta";

export interface Totals {
  /** Goedgekeurde commissie: dit geld is (bijna) zeker. */
  approved: number;
  /** Nog in behandeling bij het netwerk. */
  pending: number;
  rejected: number;
  /** Goedgekeurd + in behandeling — de verwachte opbrengst. */
  expected: number;
  transactions: number;
  sales: number;
  clicks: number;
  impressions: number;
}

export interface SeriesPoint {
  bucket: string;
  label: string;
  total: number;
  byNetwork: Record<string, number>;
}

export interface TrendPoint {
  index: number;
  label: string;
  current: number | null;
  previous: number | null;
  currentCumulative: number | null;
  previousCumulative: number | null;
}

export interface NetworkBreakdown {
  network: NetworkId;
  name: string;
  approved: number;
  pending: number;
  rejected: number;
  expected: number;
  transactions: number;
  share: number;
  previousExpected: number;
}

export interface ProgramRow {
  key: string;
  network: NetworkId;
  networkName: string;
  programName: string;
  expected: number;
  transactions: number;
}

export interface RecentTransaction {
  id: string;
  network: NetworkId;
  networkName: string;
  programName: string;
  day: string;
  status: string;
  commissionEur: number;
  currency: string;
  commission: number;
}

export interface AccountStatus {
  id: string;
  network: NetworkId;
  networkName: string;
  label: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
}

export interface DashboardData {
  range: DayRange;
  previous: DayRange;
  preset: string;
  granularity: Granularity;
  /** Netwerken waar de gebruiker een account voor heeft. */
  availableNetworks: NetworkId[];
  activeNetworks: NetworkId[];
  totals: Totals;
  previousTotals: Totals;
  series: SeriesPoint[];
  trend: TrendPoint[];
  byNetwork: NetworkBreakdown[];
  topPrograms: ProgramRow[];
  recent: RecentTransaction[];
  accounts: AccountStatus[];
  hasAnyData: boolean;
}

export interface DashboardQuery {
  preset?: string;
  from?: string;
  to?: string;
  networks?: string[];
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function emptyTotals(): Totals {
  return {
    approved: 0,
    pending: 0,
    rejected: 0,
    expected: 0,
    transactions: 0,
    sales: 0,
    clicks: 0,
    impressions: 0,
  };
}

export async function getDashboardData(
  userId: string,
  timezone: string,
  query: DashboardQuery = {},
): Promise<DashboardData> {
  const accounts = await prisma.networkAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const availableNetworks = NETWORK_IDS.filter((id) =>
    accounts.some((account) => account.network === id),
  );

  const requested = (query.networks ?? []).filter((n): n is NetworkId =>
    (NETWORK_IDS as readonly string[]).includes(n),
  );
  const activeNetworks =
    requested.length > 0
      ? NETWORK_IDS.filter((id) => requested.includes(id))
      : availableNetworks;

  const range = resolveRange(query, timezone);
  const previous = previousRange(range);
  const totalDays = daysBetween(range.from, range.to) + 1;
  const granularity = suggestGranularity(totalDays);

  const networkFilter =
    activeNetworks.length > 0 && activeNetworks.length < NETWORK_IDS.length
      ? { network: { in: activeNetworks as string[] } }
      : {};

  const [currentRows, previousRows, statRows, previousStatRows, programRows, recentRows] =
    await Promise.all([
      prisma.transaction.groupBy({
        by: ["day", "network", "status"],
        where: {
          account: { userId },
          day: { gte: range.from, lte: range.to },
          ...networkFilter,
        },
        _sum: { commissionEur: true, saleAmountEur: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ["day", "network", "status"],
        where: {
          account: { userId },
          day: { gte: previous.from, lte: previous.to },
          ...networkFilter,
        },
        _sum: { commissionEur: true, saleAmountEur: true },
        _count: { _all: true },
      }),
      prisma.dailyStat.groupBy({
        by: ["day"],
        where: {
          account: { userId },
          day: { gte: range.from, lte: range.to },
          ...networkFilter,
        },
        _sum: { clicks: true, impressions: true },
      }),
      prisma.dailyStat.groupBy({
        by: ["day"],
        where: {
          account: { userId },
          day: { gte: previous.from, lte: previous.to },
          ...networkFilter,
        },
        _sum: { clicks: true, impressions: true },
      }),
      prisma.transaction.groupBy({
        by: ["network", "programName"],
        where: {
          account: { userId },
          day: { gte: range.from, lte: range.to },
          status: { in: ["approved", "pending"] },
          ...networkFilter,
        },
        _sum: { commissionEur: true },
        _count: { _all: true },
      }),
      prisma.transaction.findMany({
        where: {
          account: { userId },
          day: { gte: range.from, lte: range.to },
          ...networkFilter,
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 25,
      }),
    ]);

  const totals = sumRows(currentRows);
  const previousTotals = sumRows(previousRows);
  for (const row of statRows) {
    totals.clicks += row._sum.clicks ?? 0;
    totals.impressions += row._sum.impressions ?? 0;
  }
  for (const row of previousStatRows) {
    previousTotals.clicks += row._sum.clicks ?? 0;
    previousTotals.impressions += row._sum.impressions ?? 0;
  }

  return {
    range,
    previous,
    preset: query.preset ?? (query.from && query.to ? "custom" : "30d"),
    granularity,
    availableNetworks,
    activeNetworks,
    totals,
    previousTotals,
    series: buildSeries(currentRows, range, granularity, activeNetworks),
    trend: buildTrend(currentRows, previousRows, range, previous, granularity),
    byNetwork: buildNetworkBreakdown(currentRows, previousRows, activeNetworks, totals),
    topPrograms: buildPrograms(programRows),
    recent: recentRows.map((row) => ({
      id: row.id,
      network: row.network as NetworkId,
      networkName: networkName(row.network),
      programName: row.programName ?? "Onbekend programma",
      day: row.day,
      status: row.status,
      commissionEur: round2(row.commissionEur),
      currency: row.currency,
      commission: round2(row.commission),
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      network: account.network as NetworkId,
      networkName: networkName(account.network),
      label: account.label,
      enabled: account.enabled,
      lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: account.lastSyncStatus,
      lastSyncMessage: account.lastSyncMessage,
    })),
    hasAnyData: totals.transactions > 0 || previousTotals.transactions > 0,
  };
}

function resolveRange(query: DashboardQuery, timezone: string): DayRange {
  if (query.from && query.to && DAY_PATTERN.test(query.from) && DAY_PATTERN.test(query.to)) {
    return query.from <= query.to
      ? { from: query.from, to: query.to }
      : { from: query.to, to: query.from };
  }
  return resolvePreset(query.preset ?? "30d", timezone);
}

type GroupRow = {
  day: string;
  network: string;
  status: string;
  _sum: { commissionEur: number | null; saleAmountEur: number | null };
  _count: { _all: number };
};

function sumRows(rows: GroupRow[]): Totals {
  const totals = emptyTotals();
  for (const row of rows) {
    const commission = row._sum.commissionEur ?? 0;
    if (row.status === "approved") totals.approved += commission;
    else if (row.status === "pending") totals.pending += commission;
    else totals.rejected += commission;

    totals.transactions += row._count._all;
    if (row.status !== "rejected") totals.sales += row._sum.saleAmountEur ?? 0;
  }
  totals.approved = round2(totals.approved);
  totals.pending = round2(totals.pending);
  totals.rejected = round2(totals.rejected);
  totals.sales = round2(totals.sales);
  totals.expected = round2(totals.approved + totals.pending);
  return totals;
}

/** Verwachte commissie per periode-emmer, uitgesplitst per netwerk. */
function buildSeries(
  rows: GroupRow[],
  range: DayRange,
  granularity: Granularity,
  activeNetworks: NetworkId[],
): SeriesPoint[] {
  const buckets = new Map<string, SeriesPoint>();
  for (const day of dayRange(range.from, range.to)) {
    const key = bucketKey(day, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, {
        bucket: key,
        label: formatBucket(key, granularity),
        total: 0,
        byNetwork: Object.fromEntries(activeNetworks.map((n) => [n, 0])),
      });
    }
  }

  for (const row of rows) {
    if (row.status === "rejected") continue;
    const key = bucketKey(row.day, granularity);
    const point = buckets.get(key);
    if (!point) continue;
    const value = row._sum.commissionEur ?? 0;
    point.total += value;
    point.byNetwork[row.network] = (point.byNetwork[row.network] ?? 0) + value;
  }

  return [...buckets.values()].map((point) => ({
    ...point,
    total: round2(point.total),
    byNetwork: Object.fromEntries(
      Object.entries(point.byNetwork).map(([k, v]) => [k, round2(v)]),
    ),
  }));
}

/**
 * Huidige periode naast de vorige, uitgelijnd op positie in de periode zodat
 * dag 1 tegen dag 1 wordt afgezet. Beide series staan in euro, dus één as.
 */
function buildTrend(
  currentRows: GroupRow[],
  previousRows: GroupRow[],
  range: DayRange,
  previous: DayRange,
  granularity: Granularity,
): TrendPoint[] {
  const currentDays = dayRange(range.from, range.to);
  const previousDays = dayRange(previous.from, previous.to);

  const currentByDay = sumByDay(currentRows);
  const previousByDay = sumByDay(previousRows);

  const currentBuckets = collapse(currentDays, currentByDay, granularity);
  const previousBuckets = collapse(previousDays, previousByDay, granularity);

  const length = Math.max(currentBuckets.length, previousBuckets.length);
  const points: TrendPoint[] = [];
  let currentRunning = 0;
  let previousRunning = 0;

  for (let i = 0; i < length; i += 1) {
    const currentEntry = currentBuckets[i];
    const previousEntry = previousBuckets[i];
    if (currentEntry) currentRunning += currentEntry.value;
    if (previousEntry) previousRunning += previousEntry.value;
    points.push({
      index: i,
      label: currentEntry
        ? formatBucket(currentEntry.bucket, granularity)
        : formatBucket(previousEntry!.bucket, granularity),
      current: currentEntry ? round2(currentEntry.value) : null,
      previous: previousEntry ? round2(previousEntry.value) : null,
      currentCumulative: currentEntry ? round2(currentRunning) : null,
      previousCumulative: previousEntry ? round2(previousRunning) : null,
    });
  }
  return points;
}

function sumByDay(rows: GroupRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "rejected") continue;
    map.set(row.day, (map.get(row.day) ?? 0) + (row._sum.commissionEur ?? 0));
  }
  return map;
}

function collapse(
  days: string[],
  values: Map<string, number>,
  granularity: Granularity,
): { bucket: string; value: number }[] {
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const day of days) {
    const key = bucketKey(day, granularity);
    if (!totals.has(key)) {
      totals.set(key, 0);
      order.push(key);
    }
    totals.set(key, totals.get(key)! + (values.get(day) ?? 0));
  }
  return order.map((bucket) => ({ bucket, value: totals.get(bucket) ?? 0 }));
}

function buildNetworkBreakdown(
  currentRows: GroupRow[],
  previousRows: GroupRow[],
  activeNetworks: NetworkId[],
  totals: Totals,
): NetworkBreakdown[] {
  const map = new Map<NetworkId, NetworkBreakdown>();
  for (const network of activeNetworks) {
    map.set(network, {
      network,
      name: networkName(network),
      approved: 0,
      pending: 0,
      rejected: 0,
      expected: 0,
      transactions: 0,
      share: 0,
      previousExpected: 0,
    });
  }

  for (const row of currentRows) {
    const entry = map.get(row.network as NetworkId);
    if (!entry) continue;
    const value = row._sum.commissionEur ?? 0;
    if (row.status === "approved") entry.approved += value;
    else if (row.status === "pending") entry.pending += value;
    else entry.rejected += value;
    entry.transactions += row._count._all;
  }

  for (const row of previousRows) {
    const entry = map.get(row.network as NetworkId);
    if (!entry || row.status === "rejected") continue;
    entry.previousExpected += row._sum.commissionEur ?? 0;
  }

  return [...map.values()]
    .map((entry) => {
      const expected = round2(entry.approved + entry.pending);
      return {
        ...entry,
        approved: round2(entry.approved),
        pending: round2(entry.pending),
        rejected: round2(entry.rejected),
        previousExpected: round2(entry.previousExpected),
        expected,
        share: totals.expected > 0 ? expected / totals.expected : 0,
      };
    })
    .sort((a, b) => b.expected - a.expected);
}

function buildPrograms(
  rows: {
    network: string;
    programName: string | null;
    _sum: { commissionEur: number | null };
    _count: { _all: number };
  }[],
): ProgramRow[] {
  return rows
    .map((row) => ({
      key: `${row.network}:${row.programName ?? "?"}`,
      network: row.network as NetworkId,
      networkName: networkName(row.network),
      programName: row.programName ?? "Onbekend programma",
      expected: round2(row._sum.commissionEur ?? 0),
      transactions: row._count._all,
    }))
    .filter((row) => row.expected > 0)
    .sort((a, b) => b.expected - a.expected)
    .slice(0, 8);
}

// De weergavehulp staat in lib/format.ts, zonder database-afhankelijkheden,
// zodat client-componenten hem kunnen gebruiken.
export {
  computeDelta,
  formatEur,
  formatNumber,
  formatPercent,
  formatRelative,
  STATUS_LABELS,
  type Delta,
} from "@/lib/format";
