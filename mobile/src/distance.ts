/**
 * Rough distance from RSSI with the log-distance path-loss model: rssi = rssiAt1m - 10·n·log10(d).
 * Phone-to-phone indoors this is only good to about ±50%; it's shown to make thresholds readable.
 */
export const RSSI_AT_1M = -60; // dBm from the Samsung beacon (Tx power 1) at 1 m
export const PATH_LOSS_EXPONENT = 2.2; // 2 in free space, higher indoors

export function estimateDistanceM(rssi: number, rssiAt1m = RSSI_AT_1M, n = PATH_LOSS_EXPONENT) {
  return 10 ** ((rssiAt1m - rssi) / (10 * n));
}

/** Bulgarian display: "≈ 2,6 м", whole metres from 10 m. */
export function formatDistance(meters: number) {
  if (meters < 0.5) return '< 0,5 м';
  const value = meters < 10 ? meters.toFixed(1).replace('.', ',') : String(Math.round(meters));
  return `≈ ${value} м`;
}
