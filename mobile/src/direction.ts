/** Pointing the phone at a beacon, using the compass heading saved when the threshold was set. */

export const POINT_ENTER_DEG = 30; // start pointing within this many degrees of the saved bearing
export const POINT_EXIT_DEG = 45; // stop pointing beyond this, so it doesn't flicker at the edge

/** Signed difference from heading to target in degrees, -180..180. Positive = turn right. */
export function angleDiff(target: number, heading: number) {
  return ((((target - heading) % 360) + 540) % 360) - 180;
}

export function isPointing(diff: number, wasPointing: boolean) {
  return Math.abs(diff) <= (wasPointing ? POINT_EXIT_DEG : POINT_ENTER_DEG);
}
