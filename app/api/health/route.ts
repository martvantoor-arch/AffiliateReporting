import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck voor het platform (Railway, Docker, een load balancer). Bewust
 * karig: alleen of de app staat, of de database bereikbaar is, en welke versie
 * er draait — dit endpoint is niet beveiligd, dus er staat niets gevoeligs in.
 *
 * Die versie is er met een reden: zonder dat gegeven is niet te zien of een
 * herstelde fout al live staat, en zoek je in code die nog niet gedeployd is.
 */
export async function GET(): Promise<Response> {
  const version = deployedVersion();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", version });
  } catch {
    return Response.json(
      { status: "database niet bereikbaar", version },
      { status: 503 },
    );
  }
}

/** Korte commit-hash van de draaiende versie, als het platform die meegeeft. */
function deployedVersion(): string {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.SOURCE_COMMIT ??
    "";
  return sha ? sha.slice(0, 7) : "onbekend";
}
