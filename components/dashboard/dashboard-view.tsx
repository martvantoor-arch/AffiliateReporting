"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BarRows, type BarRow } from "@/components/charts/bar-rows";
import { ChartFrame, DataTable, type LegendEntry } from "@/components/charts/chart-frame";
import { StackedBars } from "@/components/charts/stacked-bars";
import { TrendLines } from "@/components/charts/trend-lines";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { StatTile } from "@/components/dashboard/stat-tile";
import { SyncButton } from "@/components/dashboard/sync-button";
import { formatDayShort, formatRange } from "@/lib/dates";
import {
  computeDelta,
  formatEur,
  formatNumber,
  formatPercent,
  formatRelative,
  STATUS_LABELS,
} from "@/lib/format";
import { networkColorVar, networkName } from "@/lib/networks/meta";
import type { DashboardData } from "@/lib/reporting";

export function DashboardView({ data }: { data: DashboardData }) {
  const [refreshing, setRefreshing] = useState(false);
  const [cumulative, setCumulative] = useState(false);

  const {
    totals,
    previousTotals,
    range,
    previous,
    series,
    trend,
    byNetwork,
    topPrograms,
    recent,
    accounts,
  } = data;

  const seriesConfig = useMemo(
    () =>
      data.activeNetworks.map((network) => ({
        id: network,
        name: networkName(network),
        color: networkColorVar(network),
      })),
    [data.activeNetworks],
  );

  const expectedDelta = computeDelta(totals.expected, previousTotals.expected);
  const approvedDelta = computeDelta(totals.approved, previousTotals.approved);
  const transactionsDelta = computeDelta(totals.transactions, previousTotals.transactions);

  const rejectionRate =
    totals.expected + totals.rejected > 0
      ? totals.rejected / (totals.expected + totals.rejected)
      : 0;
  const previousRejectionRate =
    previousTotals.expected + previousTotals.rejected > 0
      ? previousTotals.rejected / (previousTotals.expected + previousTotals.rejected)
      : 0;

  const legend: LegendEntry[] = seriesConfig.map((entry) => ({
    label: entry.name,
    color: entry.color,
    value: formatEur(
      byNetwork.find((row) => row.network === entry.id)?.expected ?? 0,
      { compact: true },
    ),
  }));

  const networkRows: BarRow[] = byNetwork.map((row) => {
    const delta = computeDelta(row.expected, row.previousExpected);
    return {
      key: row.network,
      label: row.name,
      value: row.expected,
      formatted: formatEur(row.expected),
      color: networkColorVar(row.network),
      meta: `${formatNumber(row.transactions)} transacties · ${formatPercent(row.share)} van het totaal · ${formatEur(row.pending)} in behandeling`,
      delta:
        row.previousExpected > 0 || row.expected > 0
          ? {
              text: delta.ratio === null ? "nieuw" : formatPercent(Math.abs(delta.ratio), 0),
              direction: delta.direction,
            }
          : undefined,
    };
  });

  // Programma's zijn nominale categorieën: één reeks, dus één kleur voor alles.
  const programRows: BarRow[] = topPrograms.map((row) => ({
    key: row.key,
    label: row.programName,
    value: row.expected,
    formatted: formatEur(row.expected),
    color: "var(--series-1)",
    meta: `${row.networkName} · ${formatNumber(row.transactions)} transacties`,
  }));

  const trendData = trend.map((point) => ({
    label: point.label,
    current: cumulative ? point.currentCumulative : point.current,
    previous: cumulative ? point.previousCumulative : point.previous,
  }));

  const problemAccounts = accounts.filter(
    (account) => account.enabled && account.lastSyncStatus === "error",
  );
  const staleAccounts = accounts.filter(
    (account) => account.enabled && !account.lastSyncAt,
  );
  // Opgehaald, niets gevonden. Zonder deze melding leest een dashboard vol
  // nullen als een storing, terwijl er gewoon nog niets verdiend is.
  const syncedWithoutData =
    !data.hasAnyData &&
    problemAccounts.length === 0 &&
    accounts.some((account) => account.enabled && account.lastSyncAt);

  if (accounts.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <AutoRefresh />
      <FilterBar
        preset={data.preset}
        range={range}
        availableNetworks={data.availableNetworks}
        activeNetworks={data.activeNetworks}
        onPendingChange={setRefreshing}
      />

      <div className={refreshing ? "is-refreshing" : ""}>
        {problemAccounts.length > 0 ? (
          <Notice tone="critical">
            {problemAccounts.length === 1
              ? `Het ophalen bij ${problemAccounts[0].networkName} is mislukt.`
              : `Het ophalen bij ${problemAccounts.length} netwerken is mislukt.`}{" "}
            <Link href="/netwerken" className="underline underline-offset-2">
              Bekijk de details
            </Link>
            .
          </Notice>
        ) : null}

        {staleAccounts.length > 0 ? (
          <Notice tone="warning">
            {staleAccounts.length === 1
              ? `${staleAccounts[0].networkName} is nog nooit opgehaald.`
              : `${staleAccounts.length} netwerken zijn nog nooit opgehaald.`}{" "}
            Haal je cijfers op om het overzicht te vullen.
          </Notice>
        ) : null}

        {syncedWithoutData ? (
          <Notice tone="info">
            Je netwerken zijn bijgewerkt, maar er staan nog geen transacties in
            deze periode. Bij nieuwe accounts is dat normaal — zodra er een
            verkoop binnenkomt, verschijnt die hier vanzelf. Kijk desnoods verder
            terug met de periodekiezer hierboven.
          </Notice>
        ) : null}

        {/* 01 — de kop: één groot getal, geen grafiek die dat verhaal verdunt. */}
        <section className="pt-5" aria-labelledby="overzicht">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="rise">
              <p className="eyebrow">01 — Verwachte inkomsten</p>
              <h1
                id="overzicht"
                className="figure mt-2 text-[clamp(2.75rem,11vw,4.5rem)] leading-[0.95] text-ink"
              >
                {formatEur(totals.expected)}
              </h1>
              <span
                aria-hidden="true"
                className="accent-underline mt-2 block h-[6px] w-28 bg-accent"
              />
              <p className="mt-3 max-w-md text-sm text-ink-2">
                Goedgekeurd plus in behandeling over{" "}
                <span className="tnum">{formatRange(range)}</span>. Bedragen in
                vreemde valuta zijn omgerekend naar euro.
              </p>
              {/* Twee nullen vergelijken meldt "geen verschil": waar, maar ruis. */}
              {totals.expected > 0 || previousTotals.expected > 0 ? (
                <div className="mt-2">
                  <DeltaSentence
                    ratio={expectedDelta.ratio}
                    direction={expectedDelta.direction}
                    absolute={expectedDelta.absolute}
                    previousLabel={formatRange(previous)}
                  />
                </div>
              ) : null}
            </div>

            <div className="rise" style={{ animationDelay: "80ms" }}>
              <SyncButton />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Goedgekeurd"
              value={formatEur(totals.approved)}
              delta={approvedDelta}
              animationDelayMs={120}
            />
            <StatTile
              label="In behandeling"
              value={formatEur(totals.pending)}
              note="Nog niet definitief bevestigd"
              animationDelayMs={160}
            />
            <StatTile
              label="Transacties"
              value={formatNumber(totals.transactions)}
              delta={transactionsDelta}
              animationDelayMs={200}
            />
            <StatTile
              label="Afkeurpercentage"
              value={formatPercent(rejectionRate)}
              delta={computeDelta(rejectionRate, previousRejectionRate)}
              invertDelta
              animationDelayMs={240}
            />
          </div>

          {totals.clicks > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Clicks"
                value={formatNumber(totals.clicks)}
                delta={computeDelta(totals.clicks, previousTotals.clicks)}
                animationDelayMs={280}
              />
              <StatTile
                label="Omzet via jou"
                value={formatEur(totals.sales, { compact: true })}
                animationDelayMs={300}
              />
              <StatTile
                label="Per click"
                value={formatEur(totals.clicks > 0 ? totals.expected / totals.clicks : 0)}
                note="Verwachte commissie per click"
                animationDelayMs={320}
              />
              <StatTile
                label="Conversie"
                value={formatPercent(
                  totals.clicks > 0 ? totals.transactions / totals.clicks : 0,
                  2,
                )}
                animationDelayMs={340}
              />
            </div>
          ) : null}
        </section>

        <div className="mt-8 space-y-4">
          <ChartFrame
            index="02 — Verloop"
            title="Commissie per periode"
            subtitle={`Gestapeld per netwerk, per ${
              data.granularity === "day" ? "dag" : data.granularity === "week" ? "week" : "maand"
            }.`}
            legend={legend}
            animationDelayMs={120}
            table={
              <DataTable
                caption="Commissie per periode per netwerk"
                head={["Periode", ...seriesConfig.map((s) => s.name), "Totaal"]}
                rows={series.map((point) => [
                  point.label,
                  ...seriesConfig.map((s) => formatEur(point.byNetwork[s.id] ?? 0)),
                  formatEur(point.total),
                ])}
              />
            }
          >
            <StackedBars points={series} series={seriesConfig} />
          </ChartFrame>

          <ChartFrame
            index="03 — Trend"
            title="Deze periode tegen de vorige"
            subtitle={`${formatRange(range)} tegenover ${formatRange(previous)}.`}
            legend={[
              { label: "Deze periode", color: "var(--series-1)", shape: "line" },
              { label: "Vorige periode", color: "var(--ink-muted)", shape: "dashed-line" },
            ]}
            animationDelayMs={160}
            action={
              <button
                type="button"
                className="chip"
                aria-pressed={cumulative}
                onClick={() => setCumulative((value) => !value)}
              >
                Cumulatief
              </button>
            }
            table={
              <DataTable
                caption="Commissie deze periode tegenover de vorige"
                head={["Periode", "Deze periode", "Vorige periode", "Verschil"]}
                rows={trendData.map((point) => [
                  point.label,
                  point.current === null ? "—" : formatEur(point.current),
                  point.previous === null ? "—" : formatEur(point.previous),
                  point.current === null || point.previous === null
                    ? "—"
                    : formatEur(point.current - point.previous),
                ])}
              />
            }
          >
            <TrendLines
              data={trendData}
              currentLabel="Deze periode"
              previousLabel="Vorige periode"
            />
          </ChartFrame>

          {/* items-start: een kaart met weinig rijen rekt niet mee met zijn buur. */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ChartFrame
              index="04 — Netwerken"
              title="Wat brengt elk netwerk op"
              animationDelayMs={200}
              table={
                <DataTable
                  caption="Opbrengst per netwerk"
                  head={["Netwerk", "Goedgekeurd", "In behandeling", "Afgekeurd", "Verwacht"]}
                  rows={byNetwork.map((row) => [
                    row.name,
                    formatEur(row.approved),
                    formatEur(row.pending),
                    formatEur(row.rejected),
                    formatEur(row.expected),
                  ])}
                />
              }
            >
              <BarRows rows={networkRows} />
            </ChartFrame>

            <ChartFrame
              index="05 — Programma's"
              title="Beste programma's"
              subtitle="Op verwachte commissie in deze periode."
              animationDelayMs={240}
              table={
                <DataTable
                  caption="Beste programma's"
                  head={["Programma", "Netwerk", "Transacties", "Verwacht"]}
                  rows={topPrograms.map((row) => [
                    row.programName,
                    row.networkName,
                    formatNumber(row.transactions),
                    formatEur(row.expected),
                  ])}
                />
              }
            >
              <BarRows
                rows={programRows}
                emptyMessage="Nog geen programma's met commissie in deze periode."
              />
            </ChartFrame>
          </div>

          <section
            className="rise card p-4 sm:p-5"
            style={{ animationDelay: "280ms" }}
            aria-labelledby="laatste"
          >
            <p className="eyebrow">06 — Laatste transacties</p>
            <h2 id="laatste" className="font-display mt-1 text-lg text-ink sm:text-xl">
              Recent binnengekomen
            </h2>
            {/* Een lijst in plaats van een tabel: past op een telefoon zonder
                horizontaal schuiven, en het bedrag blijft altijd in beeld. */}
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                Geen transacties in deze periode.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-rule">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2.5">
                    <span className="tnum w-12 shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted">
                      {formatDayShort(row.day)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: networkColorVar(row.network) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{row.programName}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{row.networkName}</span>
                        <StatusBadge status={row.status} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-sm whitespace-nowrap text-ink">
                        {formatEur(row.commissionEur)}
                      </span>
                      {row.currency !== "EUR" ? (
                        <span className="tnum block text-xs whitespace-nowrap text-muted">
                          {row.commission} {row.currency}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="rise card p-4 sm:p-5"
            style={{ animationDelay: "320ms" }}
            aria-labelledby="koppelingen"
          >
            <p className="eyebrow">07 — Koppelingen</p>
            <h2 id="koppelingen" className="font-display mt-1 text-lg text-ink sm:text-xl">
              Stand van je netwerken
            </h2>
            <ul className="mt-4 divide-y divide-rule">
              {accounts.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: networkColorVar(account.network) }}
                  />
                  <span className="text-sm text-ink">{account.label}</span>
                  {!account.enabled ? (
                    <span className="text-xs text-muted">(uitgezet)</span>
                  ) : null}
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2 text-xs">
                    <SyncBadge status={account.lastSyncStatus} />
                    <span className="tnum whitespace-nowrap text-muted">
                      {formatRelative(account.lastSyncAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/netwerken"
              className="btn-quiet mt-4 inline-block px-3.5 py-2 text-sm"
            >
              Netwerken beheren
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}

function DeltaSentence({
  ratio,
  direction,
  absolute,
  previousLabel,
}: {
  ratio: number | null;
  direction: "up" | "down" | "flat";
  absolute: number;
  previousLabel: string;
}) {
  const color =
    direction === "up" ? "var(--good)" : direction === "down" ? "var(--critical)" : "var(--ink-muted)";
  const word = direction === "up" ? "meer" : direction === "down" ? "minder" : "gelijk";

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
      <span className="tnum font-semibold" style={{ color }}>
        <span aria-hidden="true">
          {direction === "up" ? "▲" : direction === "down" ? "▼" : "="}
        </span>{" "}
        {ratio === null ? formatEur(Math.abs(absolute)) : formatPercent(Math.abs(ratio))}
      </span>
      <span className="text-ink-2">
        {ratio === null && absolute === 0
          ? "geen verschil met"
          : `${word} dan`}{" "}
        <span className="tnum">{previousLabel}</span>
      </span>
    </p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? { color: "var(--good)", symbol: "✓" }
      : status === "rejected"
        ? { color: "var(--critical)", symbol: "✕" }
        : { color: "var(--warning)", symbol: "•" };

  return (
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      {/* Icoon plus woord: de kleur draagt de betekenis nooit alleen. */}
      <span aria-hidden="true" style={{ color: tone.color }}>
        {tone.symbol}
      </span>
      <span className="text-ink-2">{STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

function SyncBadge({ status }: { status: string | null }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1" style={{ color: "var(--critical)" }}>
        <span aria-hidden="true">✕</span> mislukt
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="flex items-center gap-1" style={{ color: "var(--warning)" }}>
        <span aria-hidden="true">!</span> deels
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="flex items-center gap-1" style={{ color: "var(--good)" }}>
        <span aria-hidden="true">✓</span> bijgewerkt
      </span>
    );
  }
  return <span className="text-muted">nog niet opgehaald</span>;
}

function Notice({
  tone,
  children,
}: {
  tone: "critical" | "warning" | "info";
  children: React.ReactNode;
}) {
  const color =
    tone === "critical"
      ? "var(--critical)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--rule-strong)";
  return (
    <div
      className="rise mt-4 flex items-start gap-2.5 rounded-[3px] border p-3 text-sm"
      style={{ borderColor: color, backgroundColor: "var(--surface)" }}
      role="status"
    >
      <span
        aria-hidden="true"
        className="mt-px font-semibold"
        style={{ color: tone === "info" ? "var(--ink-muted)" : color }}
      >
        {tone === "critical" ? "✕" : tone === "info" ? "i" : "!"}
      </span>
      <p className="text-ink-2">{children}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rise mx-auto max-w-lg py-12 text-center">
      <p className="eyebrow">Aan de slag</p>
      <h1 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">
        Nog geen netwerk gekoppeld
      </h1>
      <span
        aria-hidden="true"
        className="accent-underline mx-auto mt-3 block h-[6px] w-24 bg-accent"
      />
      <p className="mt-4 text-sm text-ink-2">
        Koppel Daisycon, TradeTracker, TradeDoubler, bol.com of Awin. Zodra er één
        staat, haalt Kasboek je transacties op en vult dit overzicht zich met
        cijfers, grafieken en trends.
      </p>
      <Link href="/netwerken" className="btn-accent mt-6 inline-block px-5 py-2.5">
        Eerste netwerk koppelen
      </Link>
    </section>
  );
}
