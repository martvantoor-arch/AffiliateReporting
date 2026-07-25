/**
 * Next roept `register()` één keer aan bij het opstarten van de server. Dat is
 * de plek om de ingebouwde planner te starten die periodiek je cijfers ophaalt.
 *
 * De import gebeurt dynamisch en alleen op de Node-runtime: op de edge-runtime
 * bestaan de database en de timers niet, en bij `next build` mag dit niet
 * meelopen.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
