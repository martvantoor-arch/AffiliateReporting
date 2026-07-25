import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck voor het platform (Railway, Docker, een load balancer). Bewust
 * karig: alleen of de app staat en of de database bereikbaar is, zonder verdere
 * gegevens — dit endpoint is niet beveiligd.
 */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "database niet bereikbaar" }, { status: 503 });
  }
}
