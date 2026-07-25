import path from "node:path";

import { prisma } from "@/lib/db";
import { encryptionKey, isProduction, sessionSecret } from "@/lib/env";

/**
 * Controle bij het opstarten, met één doel: als er iets mis is met de
 * configuratie, moet dat in de logs staan en niet pas blijken uit een lege
 * foutpagina in de browser.
 *
 * Bewust niet fataal. Een crashende container geeft op de meeste platforms een
 * herstartlus met een onduidelijke oorzaak; een luide regel in de log is
 * makkelijker te lezen.
 */
export async function runStartupCheck(): Promise<void> {
  const problems: string[] = [];

  for (const [name, read] of [
    ["ENCRYPTION_KEY", encryptionKey],
    ["SESSION_SECRET", sessionSecret],
  ] as const) {
    try {
      read();
    } catch (error) {
      problems.push(
        `${name}: ${error instanceof Error ? error.message : "onbruikbaar"}`,
      );
    }
  }

  const databaseFile = resolveDatabaseFile();
  console.log(`[start] Database: ${databaseFile ?? "Cloudflare D1 (binding DB)"}`);

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[start] Database bereikbaar.");
  } catch (error) {
    problems.push(
      `Database niet bereikbaar: ${error instanceof Error ? error.message : "onbekende fout"}`,
    );
  }

  // Het stille scenario dat je pas maanden later merkt: de database staat in de
  // container zelf, dus bij de volgende deploy is alles weg — inclusief je
  // versleutelde API-sleutels.
  if (isProduction && databaseFile && isInsideAppDirectory(databaseFile)) {
    console.warn(
      `[start] LET OP: de database staat binnen de app-map (${databaseFile}). ` +
        "Op een platform als Railway wordt die map bij elke deploy vervangen, dus " +
        "je gegevens verdwijnen dan. Koppel een volume aan (bijvoorbeeld op /data) " +
        "en zet DATABASE_URL op file:/data/kasboek.db.",
    );
  }

  if (problems.length > 0) {
    console.error(
      `[start] De configuratie is niet in orde:\n  - ${problems.join("\n  - ")}\n` +
        "  Zie .env.example en de README. Zolang dit niet klopt geven pagina's een serverfout.",
    );
  } else {
    console.log("[start] Configuratie in orde.");
  }
}

/** Het absolute pad van het SQLite-bestand, of null als we op D1 zitten. */
function resolveDatabaseFile(): string | null {
  if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") {
    return null;
  }
  const url = process.env.DATABASE_URL ?? "file:./prisma/kasboek.db";
  const withoutScheme = url.replace(/^file:/, "");
  return path.resolve(process.cwd(), withoutScheme);
}

function isInsideAppDirectory(file: string): boolean {
  const relative = path.relative(process.cwd(), file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
