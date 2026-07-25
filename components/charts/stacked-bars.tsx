"use client";

import { useMemo, useState } from "react";

import { ChartTooltip } from "@/components/charts/tooltip";
import { useWidth } from "@/components/charts/use-width";
import {
  axisTickLabel,
  indexFromX,
  labelStep,
  niceScale,
  round,
  roundedRect,
  type Margins,
} from "@/components/charts/geometry";
import { formatEur } from "@/lib/format";

export interface StackedSeries {
  id: string;
  name: string;
  color: string;
}

export interface StackedPoint {
  bucket: string;
  label: string;
  total: number;
  byNetwork: Record<string, number>;
}

interface StackedBarsProps {
  points: StackedPoint[];
  series: StackedSeries[];
  height?: number;
  emptyMessage?: string;
}

/** 2px tussenruimte in de kleur van het vlak, geen randje om de segmenten. */
const SEGMENT_GAP = 2;
const CORNER_RADIUS = 4;
const MAX_BAR_WIDTH = 26;

export function StackedBars({
  points,
  series,
  height = 260,
  emptyMessage = "Nog geen commissie in deze periode.",
}: StackedBarsProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const compact = width > 0 && width < 420;
  const margins: Margins = {
    top: 22,
    right: 6,
    bottom: 26,
    left: compact ? 40 : 52,
  };

  const scale = useMemo(() => {
    const max = points.reduce((peak, point) => Math.max(peak, point.total), 0);
    return niceScale(max);
  }, [points]);

  const plotWidth = Math.max(0, width - margins.left - margins.right);
  const plotHeight = Math.max(0, height - margins.top - margins.bottom);
  const slot = points.length > 0 ? plotWidth / points.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, slot * 0.62));
  const step = labelStep(points.length, plotWidth, compact ? 44 : 58);

  const peakIndex = useMemo(() => {
    let index = -1;
    let peak = 0;
    points.forEach((point, i) => {
      if (point.total > peak) {
        peak = point.total;
        index = i;
      }
    });
    return index;
  }, [points]);

  const y = (value: number) =>
    margins.top + plotHeight - (value / scale.max) * plotHeight;

  const activePoint = active !== null ? points[active] : null;

  // Een as zonder staven is geen grafiek maar een raadsel: liever één zin.
  // Alle hooks staan hierboven, dus deze uitstap is veilig.
  if (!points.some((point) => point.total > 0)) {
    return (
      <p
        className="flex items-center justify-center text-center text-sm text-muted"
        style={{ minHeight: height }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div ref={ref} className="relative" style={{ minHeight: height }}>
      {width > 0 ? (
        <svg
          className="chart-svg"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`Verwachte commissie per periode, gestapeld per netwerk. ${points.length} punten.`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setActive(
              indexFromX(event.clientX - bounds.left, margins.left, plotWidth, points.length),
            );
          }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? Math.max(0, points.length - 1))}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setActive((current) => {
                const base = current ?? 0;
                const next = event.key === "ArrowRight" ? base + 1 : base - 1;
                return Math.min(points.length - 1, Math.max(0, next));
              });
            }
            if (event.key === "Escape") setActive(null);
          }}
        >
          {/* Rasterlijnen: doorgetrokken haarlijnen, nooit gestippeld. */}
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margins.left}
                x2={width - margins.right}
                y1={round(y(tick))}
                y2={round(y(tick))}
                stroke={tick === 0 ? "var(--axis)" : "var(--grid)"}
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
              <text
                x={margins.left - 8}
                y={round(y(tick)) + 3.5}
                textAnchor="end"
                className="tnum"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {axisTickLabel(tick, scale)}
              </text>
            </g>
          ))}

          {/* Markering achter de actieve staaf, ruimer dan de staaf zelf. */}
          {active !== null && slot > 0 ? (
            <rect
              x={round(margins.left + active * slot)}
              y={margins.top}
              width={round(slot)}
              height={plotHeight}
              fill="var(--ink)"
              opacity="0.05"
            />
          ) : null}

          {points.map((point, index) => {
            const centre = margins.left + index * slot + slot / 2;
            const x = centre - barWidth / 2;
            let cursor = margins.top + plotHeight;

            // Van onder naar boven stapelen in de vaste reeksvolgorde.
            const segments = series
              .map((entry) => ({ entry, value: point.byNetwork[entry.id] ?? 0 }))
              .filter((segment) => segment.value > 0);

            return (
              <g key={point.bucket}>
                {segments.map((segment, segmentIndex) => {
                  const rawHeight = (segment.value / scale.max) * plotHeight;
                  const isTop = segmentIndex === segments.length - 1;
                  const gap = isTop ? 0 : SEGMENT_GAP;
                  const barHeight = Math.max(1, rawHeight - gap);
                  const top = cursor - rawHeight;
                  cursor = top;

                  return (
                    <path
                      key={segment.entry.id}
                      d={roundedRect(
                        round(x),
                        round(top),
                        round(barWidth),
                        round(barHeight),
                        CORNER_RADIUS,
                        isTop ? { topLeft: true, topRight: true } : {},
                      )}
                      fill={segment.entry.color}
                    />
                  );
                })}

                {/* Alleen het hoogtepunt krijgt een label; niet elk punt. */}
                {index === peakIndex && point.total > 0 && !compact ? (
                  <text
                    x={round(centre)}
                    y={round(y(point.total)) - 7}
                    textAnchor="middle"
                    className="tnum"
                    fontSize="10"
                    fontWeight="600"
                    fill="var(--ink)"
                  >
                    {formatEur(point.total, { compact: true })}
                  </text>
                ) : null}

                {index % step === 0 ? (
                  <text
                    x={round(centre)}
                    y={height - 8}
                    textAnchor="middle"
                    className="tnum"
                    fontSize="10"
                    fill="var(--ink-muted)"
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      {activePoint ? (
        <ChartTooltip
          x={margins.left + (active! + 0.5) * slot}
          containerWidth={width}
          title={activePoint.label}
          rows={[
            ...series
              .map((entry) => ({
                label: entry.name,
                value: formatEur(activePoint.byNetwork[entry.id] ?? 0),
                color: entry.color,
                raw: activePoint.byNetwork[entry.id] ?? 0,
              }))
              .filter((row) => row.raw > 0)
              .map(({ label, value, color }) => ({ label, value, color })),
          ]}
          footer={
            <span className="flex justify-between">
              <span>Totaal</span>
              <span className="tnum text-ink">{formatEur(activePoint.total)}</span>
            </span>
          }
        />
      ) : null}
    </div>
  );
}
