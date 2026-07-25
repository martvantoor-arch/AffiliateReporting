import { formatPercent, type Delta } from "@/lib/format";

interface StatTileProps {
  label: string;
  value: string;
  /** Korte uitleg onder de waarde. */
  note?: string;
  delta?: Delta;
  deltaSuffix?: string;
  /** Bij dalende kosten is "omlaag" juist goed. */
  invertDelta?: boolean;
  emphasis?: boolean;
  animationDelayMs?: number;
}

export function StatTile({
  label,
  value,
  note,
  delta,
  deltaSuffix = "t.o.v. vorige periode",
  invertDelta = false,
  emphasis = false,
  animationDelayMs = 0,
}: StatTileProps) {
  return (
    <div
      className={`rise card flex flex-col justify-between p-4 ${emphasis ? "sm:p-5" : ""}`}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <p className="eyebrow">{label}</p>
      <p
        className={`figure mt-2 text-ink ${
          emphasis ? "text-3xl sm:text-4xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
      {delta ? <DeltaLine delta={delta} suffix={deltaSuffix} invert={invertDelta} /> : null}
      {note ? <p className="mt-1.5 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function DeltaLine({
  delta,
  suffix,
  invert = false,
}: {
  delta: Delta;
  suffix?: string;
  invert?: boolean;
}) {
  // Zonder cijfers in de vorige periode is een percentage misleidend; dan zeggen
  // we gewoon dat er niets te vergelijken valt.
  if (delta.ratio === null) {
    if (delta.absolute === 0) return null;
    return (
      <p className="mt-1.5 text-xs text-muted">
        Geen cijfers in de vorige periode om mee te vergelijken.
      </p>
    );
  }

  const good = invert ? delta.direction === "down" : delta.direction === "up";
  const bad = invert ? delta.direction === "up" : delta.direction === "down";
  const color = good ? "var(--good)" : bad ? "var(--critical)" : "var(--ink-muted)";

  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-xs">
      {/* Richting staat in het pijltje én in het woord, niet alleen in de kleur. */}
      <span className="tnum font-semibold" style={{ color }}>
        <span aria-hidden="true">
          {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "="}
        </span>{" "}
        <span className="sr-only">
          {delta.direction === "up"
            ? "gestegen met"
            : delta.direction === "down"
              ? "gedaald met"
              : "gelijk gebleven,"}
        </span>
        {formatPercent(Math.abs(delta.ratio))}
      </span>
      {suffix ? <span className="text-muted">{suffix}</span> : null}
    </p>
  );
}
