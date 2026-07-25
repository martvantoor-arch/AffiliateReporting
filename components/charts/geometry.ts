/** Gedeelde rekenhulp voor de grafieken. Geen dependencies, alleen SVG. */

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Een "mooie" bovengrens plus de bijbehorende rasterlijnen. */
export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) {
    return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return { max: top, ticks };
}

/**
 * Rechthoek met alleen de gekozen hoeken afgerond — nodig omdat het uiteinde
 * van een staaf rond is en de aansluiting op de basislijn recht blijft.
 */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  corners: { topLeft?: boolean; topRight?: boolean; bottomRight?: boolean; bottomLeft?: boolean } = {},
): string {
  if (width <= 0 || height <= 0) return "";
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const tl = corners.topLeft ? r : 0;
  const tr = corners.topRight ? r : 0;
  const br = corners.bottomRight ? r : 0;
  const bl = corners.bottomLeft ? r : 0;

  return [
    `M${x + tl},${y}`,
    `H${x + width - tr}`,
    tr ? `a${tr},${tr} 0 0 1 ${tr},${tr}` : "",
    `V${y + height - br}`,
    br ? `a${br},${br} 0 0 1 ${-br},${br}` : "",
    `H${x + bl}`,
    bl ? `a${bl},${bl} 0 0 1 ${-bl},${-bl}` : "",
    `V${y + tl}`,
    tl ? `a${tl},${tl} 0 0 1 ${tl},${-tl}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Lijnpad dat gaten in de data overslaat in plaats van er doorheen te trekken. */
export function linePath(points: { x: number; y: number | null }[]): string {
  let path = "";
  let pendown = false;
  for (const point of points) {
    if (point.y === null) {
      pendown = false;
      continue;
    }
    path += `${pendown ? "L" : "M"}${round(point.x)},${round(point.y)} `;
    pendown = true;
  }
  return path.trim();
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Hoeveel labels passen er op de as? Bij smalle schermen slaan we labels over
 * in plaats van ze te laten overlappen of te kantelen.
 */
export function labelStep(count: number, width: number, minSpacing = 54): number {
  if (count <= 1) return 1;
  const fits = Math.max(1, Math.floor(width / minSpacing));
  return Math.max(1, Math.ceil(count / fits));
}

/** Index van de staaf/het punt onder de aanwijzer. */
export function indexFromX(
  x: number,
  plotLeft: number,
  plotWidth: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const ratio = (x - plotLeft) / Math.max(1, plotWidth);
  const index = Math.floor(ratio * count);
  return Math.min(count - 1, Math.max(0, index));
}

/** Index van het dichtstbijzijnde punt, voor lijnen met markers op de knik. */
export function nearestIndex(
  x: number,
  plotLeft: number,
  plotWidth: number,
  count: number,
): number {
  if (count <= 1) return 0;
  const step = plotWidth / (count - 1);
  const index = Math.round((x - plotLeft) / step);
  return Math.min(count - 1, Math.max(0, index));
}
