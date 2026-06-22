import "server-only";

const PROBE_INTERVAL_MS = 60_000;

class Scheduler {
  private started = false;
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.started) return;
    this.started = true;
    const tick = async () => {
      try {
        const { runProbesForAllSites } = await import("@/lib/probe");
        const out = await runProbesForAllSites();
        if (out.count > 0) console.log(`[scheduler] probed ${out.count} sites`);
      } catch (err) {
        console.error("[scheduler] probe error", err);
      }
    };
    this.timer = setInterval(tick, PROBE_INTERVAL_MS);
    // first tick after 10s so a freshly-added site sees data fast
    setTimeout(tick, 10_000);
    console.log("[scheduler] started — probing every 60s");
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sgScheduler: Scheduler | undefined;
}

export function getScheduler(): Scheduler {
  if (!globalThis.__sgScheduler) globalThis.__sgScheduler = new Scheduler();
  return globalThis.__sgScheduler;
}
