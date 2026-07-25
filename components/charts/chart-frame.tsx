"use client";

import { useId, useState, type ReactNode } from "react";

export interface LegendEntry {
  label: string;
  color: string;
  /** Optionele waarde achter het label, bijvoorbeeld het totaal van de reeks. */
  value?: string;
  /** Doorgetrokken lijn in plaats van een blokje, voor lijngrafieken. */
  shape?: "block" | "line" | "dashed-line";
}

interface ChartFrameProps {
  /** Volgnummer in de kantlijn — het kasboek-motief. */
  index: string;
  title: string;
  subtitle?: string;
  legend?: LegendEntry[];
  /** Elke grafiek heeft een tabelvariant; die is de toegankelijke tweeling. */
  table: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  animationDelayMs?: number;
}

export function ChartFrame({
  index,
  title,
  subtitle,
  legend,
  table,
  children,
  action,
  animationDelayMs = 0,
}: ChartFrameProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const panelId = useId();

  return (
    <section
      className="rise card p-4 sm:p-5"
      style={{ animationDelay: `${animationDelayMs}ms` }}
      aria-labelledby={`${panelId}-title`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{index}</p>
          <h2
            id={`${panelId}-title`}
            className="font-display mt-1 text-lg leading-tight text-ink sm:text-xl"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action}
          <div
            role="group"
            aria-label="Weergave"
            className="flex overflow-hidden rounded-[3px] border border-rule-strong"
          >
            <button
              type="button"
              onClick={() => setView("chart")}
              aria-pressed={view === "chart"}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "chart"
                  ? "bg-ink text-plane"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              Grafiek
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={`border-l border-rule-strong px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "table"
                  ? "bg-ink text-plane"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              Tabel
            </button>
          </div>
        </div>
      </header>

      {legend && legend.length > 0 ? (
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2 text-xs">
              <LegendMark color={entry.color} shape={entry.shape ?? "block"} />
              <span className="text-ink-2">{entry.label}</span>
              {entry.value ? (
                <span className="tnum text-ink">{entry.value}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        {view === "chart" ? (
          children
        ) : (
          <div className="scroll-pane -mx-1 px-1">{table}</div>
        )}
      </div>
    </section>
  );
}

function LegendMark({ color, shape }: { color: string; shape: LegendEntry["shape"] }) {
  if (shape === "line" || shape === "dashed-line") {
    return (
      <svg width="18" height="10" aria-hidden="true" className="shrink-0">
        <line
          x1="0"
          y1="5"
          x2="18"
          y2="5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={shape === "dashed-line" ? "5 4" : undefined}
        />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="block size-2.5 shrink-0 rounded-[2px]"
      style={{ backgroundColor: color }}
    />
  );
}

/** Eenvoudige tabelopmaak die alle grafiek-tweelingen delen. */
export function DataTable({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: (ReactNode[])[];
  caption?: string;
}) {
  return (
    <table className="w-full min-w-[28rem] border-collapse text-sm">
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-rule-strong">
          {head.map((label, index) => (
            <th
              key={label}
              scope="col"
              className={`py-2 pr-3 text-xs font-semibold whitespace-nowrap text-ink-2 ${
                index === 0 ? "text-left" : "text-right"
              }`}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="py-6 text-center text-sm text-muted">
              Geen gegevens in deze periode.
            </td>
          </tr>
        ) : (
          rows.map((cells, rowIndex) => (
            <tr key={rowIndex} className="border-b border-rule last:border-0">
              {cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`py-2 pr-3 ${
                    cellIndex === 0 ? "text-left text-ink" : "tnum text-right text-ink"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
