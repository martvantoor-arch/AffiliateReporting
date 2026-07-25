"use client";

import { useMemo, useState } from "react";

import {
  labelStep,
  linePath,
  nearestIndex,
  niceScale,
  round,
  type Margins,
} from "@/components/charts/geometry";
import { ChartTooltip } from "@/components/charts/tooltip";
import { useWidth } from "@/components/charts/use-width";
import { formatEur } from "@/lib/format";

export interface TrendDatum {
  label: string;
  current: number | null;
  previous: number | null;
}

interface TrendLinesProps {
  data: TrendDatum[];
  currentLabel: string;
  previousLabel: string;
  height?: number;
}

const CURRENT_COLOR = "var(--series-1)";
const PREVIOUS_COLOR = "var(--ink-muted)";

/**
 * Twee even lange periodes naast elkaar. Beide reeksen staan in euro, dus ze
 * delen één as — een tweede y-as zou een verband suggereren dat er niet is.
 */
export function TrendLines({
  data,
  currentLabel,
  previousLabel,
  height = 240,
}: TrendLinesProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const compact = width > 0 && width < 420;
  const margins: Margins = {
    top: 18,
    right: compact ? 10 : 16,
    bottom: 26,
    left: compact ? 40 : 52,
  };

  const scale = useMemo(() => {
    const max = data.reduce(
      (peak, point) => Math.max(peak, point.current ?? 0, point.previous ?? 0),
      0,
    );
    return niceScale(max);
  }, [data]);

  const plotWidth = Math.max(0, width - margins.left - margins.right);
  const plotHeight = Math.max(0, height - margins.top - margins.bottom);
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const x = (index: number) => margins.left + index * step;
  const y = (value: number) =>
    margins.top + plotHeight - (value / scale.max) * plotHeight;

  const currentPoints = data.map((point, index) => ({
    x: x(index),
    y: point.current === null ? null : y(point.current),
  }));
  const previousPoints = data.map((point, index) => ({
    x: x(index),
    y: point.previous === null ? null : y(point.previous),
  }));

  const labelEvery = labelStep(data.length, plotWidth, compact ? 48 : 62);
  const activePoint = active !== null ? data[active] : null;

  // Alleen het laatste punt van de huidige reeks krijgt een vast label.
  const lastCurrentIndex = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if (data[i].current !== null) return i;
    }
    return -1;
  }, [data]);

  return (
    <div ref={ref} className="relative" style={{ minHeight: height }}>
      {width > 0 ? (
        <svg
          className="chart-svg"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`Commissie per periode: ${currentLabel} vergeleken met ${previousLabel}.`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setActive(
              nearestIndex(event.clientX - bounds.left, margins.left, plotWidth, data.length),
            );
          }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? Math.max(0, data.length - 1))}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setActive((current) => {
                const base = current ?? 0;
                const next = event.key === "ArrowRight" ? base + 1 : base - 1;
                return Math.min(data.length - 1, Math.max(0, next));
              });
            }
            if (event.key === "Escape") setActive(null);
          }}
        >
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
                {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
              </text>
            </g>
          ))}

          {active !== null ? (
            <line
              x1={round(x(active))}
              x2={round(x(active))}
              y1={margins.top}
              y2={margins.top + plotHeight}
              stroke="var(--ink)"
              strokeWidth="1"
              opacity="0.25"
            />
          ) : null}

          {/* De vorige periode ligt achter, in gedempt grijs met streepjes. */}
          <path
            d={linePath(previousPoints)}
            fill="none"
            stroke={PREVIOUS_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 4"
          />
          <path
            d={linePath(currentPoints)}
            fill="none"
            stroke={CURRENT_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Markers pas bij hover; anders wordt een lange reeks een kralenketting. */}
          {active !== null ? (
            <>
              {previousPoints[active]?.y !== null &&
              previousPoints[active] !== undefined ? (
                <circle
                  cx={round(previousPoints[active].x)}
                  cy={round(previousPoints[active].y!)}
                  r="4.5"
                  fill={PREVIOUS_COLOR}
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ) : null}
              {currentPoints[active]?.y !== null && currentPoints[active] !== undefined ? (
                <circle
                  cx={round(currentPoints[active].x)}
                  cy={round(currentPoints[active].y!)}
                  r="4.5"
                  fill={CURRENT_COLOR}
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ) : null}
            </>
          ) : lastCurrentIndex >= 0 && !compact ? (
            <circle
              cx={round(currentPoints[lastCurrentIndex].x)}
              cy={round(currentPoints[lastCurrentIndex].y!)}
              r="4"
              fill={CURRENT_COLOR}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ) : null}

          {data.map((point, index) =>
            index % labelEvery === 0 ? (
              <text
                key={`${point.label}-${index}`}
                x={round(x(index))}
                y={height - 8}
                textAnchor={
                  index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"
                }
                className="tnum"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </svg>
      ) : null}

      {activePoint ? (
        <ChartTooltip
          x={x(active!)}
          containerWidth={width}
          title={activePoint.label}
          rows={[
            {
              label: currentLabel,
              value: activePoint.current === null ? "—" : formatEur(activePoint.current),
              color: "var(--series-1)",
            },
            {
              label: previousLabel,
              value: activePoint.previous === null ? "—" : formatEur(activePoint.previous),
              color: "var(--ink-muted)",
            },
          ]}
        />
      ) : null}
    </div>
  );
}
