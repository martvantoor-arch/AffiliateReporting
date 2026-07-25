/**
 * Centrale plek voor omgevingsvariabelen. Ontbrekende of te zwakke secrets
 * leiden tot een harde fout bij het opstarten in plaats van een stille
 * downgrade van de beveiliging.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Omgevingsvariabele ${name} ontbreekt. Kopieer .env.example naar .env en vul de waarden aan (zie README).`,
    );
  }
  return value.trim();
}

/** Sleutel voor het versleutelen van API-credentials in de database. */
export function encryptionKey(): Buffer {
  const raw = required("ENCRYPTION_KEY");
  // Accepteer 64 hex-tekens of base64 van 32 bytes.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY moet 32 bytes zijn (64 hex-tekens of base64). Genereer met: openssl rand -hex 32",
    );
  }
  return key;
}

/** Sleutel voor het ondertekenen van sessiecookies. */
export function sessionSecret(): string {
  const secret = required("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET moet minimaal 32 tekens zijn. Genereer met: openssl rand -hex 32",
    );
  }
  return secret;
}

/** Token waarmee de cron-endpoint zichzelf mag aanroepen. */
export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

/**
 * Wie mag een account aanmaken. Leeg betekent: alleen de eerste registratie
 * is toegestaan (daarna is de app dicht).
 */
export function allowedSignupEmails(): string[] {
  return (process.env.ALLOWED_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isProduction = process.env.NODE_ENV === "production";

/** Standaard tijdzone voor dag-groepering van transacties. */
export const defaultTimezone = process.env.APP_TIMEZONE?.trim() || "Europe/Amsterdam";
