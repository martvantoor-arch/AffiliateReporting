import { XMLParser } from "fast-xml-parser";

import { AdapterError, request, truncate } from "@/lib/networks/http";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Namespaces verschillen per omgeving; door ze te strippen kunnen we op
  // lokale elementnaam zoeken en blijft de parser werken als TradeTracker
  // een nieuwe prefix gebruikt.
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

export type SoapValue =
  | string
  | number
  | boolean
  | null
  | SoapValue[]
  | { [key: string]: SoapValue };

/**
 * Minimale SOAP 1.1-client. Genoeg voor de affiliate-webservices die we
 * aanspreken, zonder een volledige WSDL-stack als dependency.
 */
export class SoapClient {
  private cookies = new Map<string, string>();

  constructor(
    private readonly endpoint: string,
    private readonly namespace: string,
    private readonly label: string,
  ) {}

  async call(
    method: string,
    params: Record<string, SoapValue> = {},
  ): Promise<Record<string, SoapValue>> {
    const body = buildEnvelope(this.namespace, method, params);
    const response = await request(this.endpoint, {
      method: "POST",
      body,
      headers: {
        "content-type": 'text/xml; charset="utf-8"',
        soapaction: `${this.namespace}#${method}`,
        accept: "text/xml",
        ...(this.cookies.size > 0 ? { cookie: this.cookieHeader() } : {}),
      },
      label: this.label,
      timeoutMs: 60_000,
    });

    this.rememberCookies(response);

    const text = await response.text();
    const parsed = parser.parse(text) as Record<string, SoapValue>;
    const envelope = findNode(parsed, "Envelope") ?? parsed;
    const fault = findNode(envelope, "Fault");
    if (fault) {
      const message =
        asText(findValue(fault, "faultstring")) ||
        asText(findValue(fault, "Reason")) ||
        "onbekende SOAP-fout";
      throw new AdapterError(`${this.label}: ${truncate(message)}`);
    }
    const soapBody = findNode(envelope, "Body");
    if (!soapBody) {
      throw new AdapterError(`${this.label} gaf een antwoord zonder SOAP-body terug.`);
    }
    return soapBody;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private rememberCookies(response: Response): void {
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie") ?? ""].filter(Boolean);
    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    }
  }
}

function buildEnvelope(
  namespace: string,
  method: string,
  params: Record<string, SoapValue>,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
    ` xmlns:ns1="${escapeXml(namespace)}">`,
    "<soap:Body>",
    `<ns1:${method}>`,
    serialise(params),
    `</ns1:${method}>`,
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

function serialise(params: Record<string, SoapValue>): string {
  return Object.entries(params)
    .map(([key, value]) => serialiseValue(key, value))
    .join("");
}

function serialiseValue(key: string, value: SoapValue): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((item) => serialiseValue(key, item)).join("");
  }
  if (typeof value === "object") {
    return `<${key}>${serialise(value as Record<string, SoapValue>)}</${key}>`;
  }
  if (typeof value === "boolean") {
    return `<${key}>${value ? "true" : "false"}</${key}>`;
  }
  return `<${key}>${escapeXml(String(value))}</${key}>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ------------------------------------------------------------------ *
 * Zoeken in het geparseerde antwoord. De exacte nesting verschilt per
 * webservice, dus we zoeken op lokale naam in plaats van op een vast pad.
 * ------------------------------------------------------------------ */

export function findNode(
  source: SoapValue,
  name: string,
  depth = 0,
): Record<string, SoapValue> | null {
  if (depth > 12 || source === null || typeof source !== "object") return null;
  if (Array.isArray(source)) {
    for (const item of source) {
      const hit = findNode(item, name, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === name && value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, SoapValue>;
    }
  }
  for (const value of Object.values(source)) {
    const hit = findNode(value, name, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Alle objecten met deze lokale naam, ongeacht waar ze in de boom zitten. */
export function collectNodes(
  source: SoapValue,
  names: string[],
  depth = 0,
): Record<string, SoapValue>[] {
  const found: Record<string, SoapValue>[] = [];
  if (depth > 12 || source === null || typeof source !== "object") return found;
  if (Array.isArray(source)) {
    for (const item of source) found.push(...collectNodes(item, names, depth + 1));
    return found;
  }
  for (const [key, value] of Object.entries(source)) {
    if (names.includes(key)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            found.push(item as Record<string, SoapValue>);
          }
        }
      } else if (value !== null && typeof value === "object") {
        found.push(value as Record<string, SoapValue>);
      }
    } else {
      found.push(...collectNodes(value, names, depth + 1));
    }
  }
  return found;
}

export function findValue(
  source: SoapValue,
  ...names: string[]
): SoapValue | undefined {
  if (source === null || typeof source !== "object") return undefined;
  const target = names.map((n) => n.toLowerCase());
  const queue: SoapValue[] = [source];
  let steps = 0;
  while (queue.length > 0 && steps < 5000) {
    steps += 1;
    const current = queue.shift();
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (target.includes(key.toLowerCase())) {
        if (value !== null && value !== undefined && value !== "") return value;
      }
    }
    queue.push(...Object.values(current));
  }
  return undefined;
}

export function asText(value: SoapValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.map(asText).join(", ");
    // Elementen met attributen krijgen de tekst in "#text".
    const inner = (value as Record<string, SoapValue>)["#text"];
    return inner === undefined ? "" : asText(inner);
  }
  return String(value);
}
