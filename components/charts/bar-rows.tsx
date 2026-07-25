"use client";

export interface BarRow {
  key: string;
  label: string;
  /** Tweede regel met context, bijvoorbeeld aantal transacties en aandeel. */
  meta?: string;
  value: number;
  formatted: string;
  color: string;
  /** Optionele vergelijking met de vorige periode. */
  delta?: { text: string; direction: "up" | "down" | "flat" };
}

interface BarRowsProps {
  rows: BarRow[];
  /** Alle rijen delen één schaal, anders zijn de lengtes niet vergelijkbaar. */
  max?: number;
  emptyMessage?: string;
}

/**
 * Gerangschikte horizontale staven. In HTML in plaats van SVG: labels lopen
 * dan netjes af op smalle schermen en de waarden staan altijd zichtbaar
 * naast de staaf, nooit alleen in een tooltip.
 */
export function BarRows({
  rows,
  max,
  emptyMessage = "Geen gegevens in deze periode.",
}: BarRowsProps) {
  const peak = max ?? rows.reduce((best, row) => Math.max(best, row.value), 0);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const ratio = peak > 0 ? Math.max(0, row.value) / peak : 0;
        return (
          <li key={row.key} className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-sm text-ink">{row.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {row.delta ? (
                  <span
                    className="tnum text-xs"
                    style={{
                      color:
                        row.delta.direction === "up"
                          ? "var(--good)"
                          : row.delta.direction === "down"
                            ? "var(--critical)"
                            : "var(--ink-muted)",
                    }}
                  >
                    {row.delta.direction === "up"
                      ? "▲"
                      : row.delta.direction === "down"
                        ? "▼"
                        : "="}{" "}
                    {row.delta.text}
                  </span>
                ) : null}
                <span className="tnum text-sm font-semibold text-ink">{row.formatted}</span>
              </span>
            </div>

            {/* Dunne staaf op een verzonken spoor; het uiteinde is 4px rond. */}
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-[2px] bg-sunken">
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  width: `${Math.max(ratio * 100, row.value > 0 ? 1.5 : 0)}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>

            {row.meta ? (
              <p className="mt-1 text-xs text-muted">{row.meta}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
