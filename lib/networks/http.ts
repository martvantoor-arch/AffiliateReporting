/** Fout waarvan de melding veilig aan de gebruiker getoond kan worden. */
export class AdapterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  /** Naam van het netwerk, voor begrijpelijke foutmeldingen. */
  label?: string;
}

/**
 * fetch met timeout en nette fouten. Antwoordtekst wordt afgekapt zodat een
 * HTML-foutpagina niet als "melding" in de UI belandt.
 */
export async function request(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, label = "API", ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "AffiliateReporting/1.0",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await safeText(response);
      throw new AdapterError(
        `${label} gaf HTTP ${response.status}${body ? `: ${body}` : ""}`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AdapterError(`${label} reageerde niet binnen ${timeoutMs / 1000} seconden.`);
    }
    throw new AdapterError(
      `${label} onbereikbaar: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await request(url, options);
  const text = await response.text();
  if (!text.trim()) return [] as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AdapterError(
      `${options.label ?? "API"} gaf geen geldige JSON terug: ${truncate(text)}`,
    );
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return truncate(await response.text());
  } catch {
    return "";
  }
}

export function truncate(value: string, max = 300): string {
  const clean = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Deelt een periode op in blokken, want veel API's limiteren het bereik. */
export function chunkRange(
  from: Date,
  to: Date,
  maxDays: number,
): { from: Date; to: Date }[] {
  const chunks: { from: Date; to: Date }[] = [];
  const spanMs = maxDays * 24 * 60 * 60 * 1000;
  let cursor = from.getTime();
  const end = to.getTime();
  while (cursor <= end) {
    const chunkEnd = Math.min(cursor + spanMs - 1, end);
    chunks.push({ from: new Date(cursor), to: new Date(chunkEnd) });
    cursor = chunkEnd + 1;
  }
  return chunks;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO-tijdstempel zonder tijdzone-suffix; verschillende API's eisen dit. */
export function toNaiveIso(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/** Leest een veld uit een object, ongeacht schrijfwijze of scheidingsteken. */
export function pick(
  source: Record<string, unknown>,
  ...names: string[]
): unknown {
  const index = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    index.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (index.has(key)) {
      const value = index.get(key);
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }
  return undefined;
}
