import { pruneExpiredSessions } from "@/lib/auth/session";
import { constantTimeEqual } from "@/lib/crypto";
import { cronSecret } from "@/lib/env";
import { syncAllUsers, DEFAULT_LOOKBACK_DAYS } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Automatische sync voor alle gebruikers. Beveiligd met CRON_SECRET, mee te
 * geven als `Authorization: Bearer <secret>` of `?token=<secret>`.
 *
 * Voorbeeld crontab (elk uur):
 *   0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://jouw-app/api/cron/sync
 */
export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      {
        error:
          "CRON_SECRET is niet ingesteld (minimaal 16 tekens). De automatische sync staat daarom uit.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const provided = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (url.searchParams.get("token") ?? "");

  if (!provided || !constantTimeEqual(provided, secret)) {
    return Response.json({ error: "Niet toegestaan." }, { status: 401 });
  }

  const lookbackParam = Number.parseInt(url.searchParams.get("lookbackDays") ?? "", 10);
  const lookbackDays =
    Number.isFinite(lookbackParam) && lookbackParam > 0
      ? Math.min(lookbackParam, 730)
      : DEFAULT_LOOKBACK_DAYS;

  const report = await syncAllUsers(lookbackDays);
  const prunedSessions = await pruneExpiredSessions();

  return Response.json({
    ranAt: new Date().toISOString(),
    lookbackDays,
    prunedSessions,
    users: report,
  });
}
