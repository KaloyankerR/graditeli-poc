"""Zone detection: RSSI smoothing, hysteresis and stale handling. Pure logic, no BLE/IO."""

import time
from collections import deque


class ZoneEngine:
    def __init__(self, enter_rssi, exit_rssi, window, stale_sec, switch_margin_db,
                 clock=time.monotonic):
        self.enter_rssi = enter_rssi
        self.exit_rssi = exit_rssi
        self.window = window
        self.stale_sec = stale_sec
        self.switch_margin_db = switch_margin_db
        self.clock = clock
        self.current = None          # instance id of the zone we are in
        self._readings = {}          # instance -> deque of recent RSSI values
        self._last_seen = {}         # instance -> clock() of last reading

    def add(self, instance, rssi):
        now = self.clock()
        if self._is_stale(instance, now):
            self._readings.pop(instance, None)   # don't mix old readings with fresh ones
        self._readings.setdefault(instance, deque(maxlen=self.window)).append(rssi)
        self._last_seen[instance] = now

    def averages(self):
        """Moving-average RSSI per beacon, excluding stale beacons."""
        now = self.clock()
        return {i: sum(r) / len(r) for i, r in self._readings.items()
                if not self._is_stale(i, now)}

    def evaluate(self):
        """Update the current zone. Return the newly entered zone id, else None."""
        avgs = self.averages()
        if self.current is not None and avgs.get(self.current, float("-inf")) < self.exit_rssi:
            self.current = None

        if not avgs:
            return None
        best = max(avgs, key=avgs.get)
        if best == self.current or avgs[best] <= self.enter_rssi:
            return None
        if self.current is not None and avgs[best] - avgs[self.current] <= self.switch_margin_db:
            return None
        self.current = best
        return best

    def _is_stale(self, instance, now):
        last = self._last_seen.get(instance)
        return last is not None and now - last > self.stale_sec
