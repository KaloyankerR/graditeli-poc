/** Zone detection: RSSI smoothing, hysteresis and stale handling. Port of mac/zone_engine.py. */

export type ZoneSettings = {
  enterRssi: number; // dBm: smoothed RSSI above this enters a zone
  exitRssi: number; // dBm: smoothed RSSI below this leaves the current zone
  window: number; // readings in the slow average, used to leave a zone
  enterWindow: number; // readings in the fast average, used to enter or switch zones
  staleMs: number; // beacon not seen for this long is ignored
  switchMarginDb: number; // another beacon must be this much stronger to switch zones
};

export class ZoneEngine {
  current: string | null = null; // instance id of the zone we are in
  private readings = new Map<string, number[]>();
  private lastSeen = new Map<string, number>();

  constructor(
    public settings: ZoneSettings,
    private clock: () => number = Date.now,
  ) {}

  add(instance: string, rssi: number) {
    const now = this.clock();
    if (this.isStale(instance, now)) this.readings.delete(instance); // don't mix old readings with fresh ones
    const values = this.readings.get(instance) ?? [];
    values.push(rssi);
    if (values.length > this.settings.window) values.splice(0, values.length - this.settings.window);
    this.readings.set(instance, values);
    this.lastSeen.set(instance, now);
  }

  /** Smoothed RSSI per beacon over the last `window` readings (see upperMean), excluding stale beacons. */
  averages(window = this.settings.window): Map<string, number> {
    const now = this.clock();
    const avgs = new Map<string, number>();
    for (const [instance, values] of this.readings) {
      if (this.isStale(instance, now)) continue;
      avgs.set(instance, upperMean(values.slice(-window)));
    }
    return avgs;
  }

  /**
   * Update the current zone. Return the newly entered zone id, else null.
   * Entering uses the short window so it reacts fast; leaving uses the long one so it doesn't flicker.
   */
  evaluate(): string | null {
    const { enterRssi, exitRssi, switchMarginDb, enterWindow } = this.settings;
    const slow = this.averages();
    if (this.current !== null && (slow.get(this.current) ?? -Infinity) < exitRssi) this.current = null;

    const fast = this.averages(enterWindow);
    let best: string | null = null;
    for (const [instance, avg] of fast) if (best === null || avg > fast.get(best)!) best = instance;
    if (best === null || best === this.current || fast.get(best)! <= enterRssi) return null;
    if (this.current !== null && fast.get(best)! - fast.get(this.current)! <= switchMarginDb) return null;
    this.current = best;
    return best;
  }

  private isStale(instance: string, now: number) {
    const last = this.lastSeen.get(instance);
    return last !== undefined && now - last > this.settings.staleMs;
  }
}

/**
 * Mean of the strongest half of the readings. Bodies and walls only ever push RSSI down (deep
 * drops of 10+ dB for a packet or two), never up, so the strongest readings track distance best.
 */
export function upperMean(values: number[]) {
  const top = [...values].sort((a, b) => b - a).slice(0, Math.ceil(values.length / 2));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/** Map RSSI linearly to volume: farRssi (or weaker) -> minVolume, nearRssi (or stronger) -> 1. */
export function volumeForRssi(rssi: number, farRssi: number, nearRssi: number, minVolume: number) {
  const frac = (rssi - farRssi) / (nearRssi - farRssi);
  return minVolume + (1 - minVolume) * Math.max(0, Math.min(1, frac));
}
