/** Weergavehulp zonder server-afhankelijkheden; ook bruikbaar in de browser. */

export function formatEur(value: number, options: { compact?: boolean } = {}): string {
  if (options.compact && Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("nl-NL").format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export interface Delta {
  /** Verschil als fractie, of null als vergelijken zinloos is. */
  ratio: number | null;
  absolute: number;
  direction: "up" | "down" | "flat";
}

export function computeDelta(current: number, previous: number): Delta {
  const absolute = Math.round((current - previous) * 100) / 100;
  if (previous === 0) {
    return {
      ratio: null,
      absolute,
      direction: current > 0 ? "up" : current < 0 ? "down" : "flat",
    };
  }
  const ratio = absolute / Math.abs(previous);
  return {
    ratio,
    absolute,
    direction: Math.abs(ratio) < 0.001 ? "flat" : ratio > 0 ? "up" : "down",
  };
}

export const STATUS_LABELS: Record<string, string> = {
  approved: "Goedgekeurd",
  pending: "In behandeling",
  rejected: "Afgekeurd",
};

/** Relatieve tijd in gewoon Nederlands, voor "laatst bijgewerkt". */
export function formatRelative(iso: string | null): string {
  if (!iso) return "nog nooit";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "onbekend";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "net";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  if (days === 1) return "gisteren";
  if (days < 30) return `${days} dagen geleden`;
  const months = Math.round(days / 30);
  return months === 1 ? "een maand geleden" : `${months} maanden geleden`;
}
