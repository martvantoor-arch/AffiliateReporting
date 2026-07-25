import { pruneExpiredSessions } from "@/lib/auth/session";
import { autoSyncMinutes } from "@/lib/env";
import { syncAllUsers } from "@/lib/sync";

/**
 * Planner die in het app-proces zelf loopt. Zo hoef je op een platform als
 * Railway geen tweede service of externe cron te regelen: de app haalt zijn
 * eigen cijfers op.
 *
 * Dit werkt omdat de app als één langlopend proces draait. Zet je meerdere
 * instanties op, gebruik dan het endpoint /api/cron/sync met een externe cron
 * en zet AUTO_SYNC_MINUTES op 0 — anders halen alle instanties tegelijk op.
 */

/** Even wachten na het opstarten, zodat de eerste bezoeker niet hoeft te wachten. */
const START_DELAY_MS = 45_000;

let started = false;
let running = false;

export function startScheduler(): void {
  const minutes = autoSyncMinutes();

  if (started) return;
  if (minutes <= 0) {
    console.log("[planner] Automatisch ophalen staat uit (AUTO_SYNC_MINUTES=0).");
    return;
  }
  started = true;

  console.log(`[planner] Automatisch ophalen elke ${minutes} minuten.`);

  const tick = async () => {
    // Duurt een ronde langer dan het interval, dan slaan we er een over in
    // plaats van twee syncs door elkaar te laten lopen.
    if (running) {
      console.log("[planner] Vorige ronde loopt nog; deze wordt overgeslagen.");
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const report = await syncAllUsers();
      const upserted = report.reduce((sum, entry) => sum + entry.upserted, 0);
      const failed = report.reduce((sum, entry) => sum + entry.failed, 0);
      const pruned = await pruneExpiredSessions();
      console.log(
        `[planner] Ronde klaar in ${Math.round((Date.now() - startedAt) / 1000)}s: ` +
          `${upserted} transactie(s) bijgewerkt, ${failed} netwerk(en) mislukt, ` +
          `${pruned} verlopen sessie(s) opgeruimd.`,
      );
    } catch (error) {
      // Nooit laten doorslaan naar het proces: de webapp moet blijven draaien.
      console.error(
        "[planner] Ronde mislukt:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };

  const timer = setTimeout(() => {
    void tick();
    const interval = setInterval(() => void tick(), minutes * 60 * 1000);
    // Het proces hoeft niet open te blijven voor deze timer.
    interval.unref?.();
  }, START_DELAY_MS);
  timer.unref?.();
}
