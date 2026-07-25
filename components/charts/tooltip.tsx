"use client";

import type { ReactNode } from "react";

interface ChartTooltipProps {
  /** Positie in pixels binnen de grafiekcontainer. */
  x: number;
  containerWidth: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
  footer?: ReactNode;
}

const WIDTH = 208;

/**
 * Zweeft boven de grafiek en klapt om bij de rand, zodat hij op een telefoon
 * niet half buiten beeld valt.
 */
export function ChartTooltip({
  x,
  containerWidth,
  title,
  rows,
  footer,
}: ChartTooltipProps) {
  const left = Math.min(Math.max(8, x - WIDTH / 2), Math.max(8, containerWidth - WIDTH - 8));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-0 z-10 rounded-[3px] border border-rule-strong bg-raised p-2.5 text-xs"
      style={{ left, width: WIDTH, boxShadow: "var(--shadow-pop)" }}
    >
      <p className="font-semibold text-ink">{title}</p>
      <dl className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[1px]"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <dt className="min-w-0 flex-1 truncate text-ink-2">{row.label}</dt>
            <dd className="tnum shrink-0 text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <div className="mt-2 border-t border-rule pt-1.5 text-ink-2">{footer}</div>
      ) : null}
    </div>
  );
}
