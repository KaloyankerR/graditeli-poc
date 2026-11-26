"""Default tuning values. Each one can be overridden by a CLI flag (see main.py --help)."""

ENTER_RSSI = -65  # dBm: smoothed RSSI above this enters a zone
EXIT_RSSI = -75  # dBm: smoothed RSSI below this leaves the current zone
WINDOW = 3  # readings in the moving average
STALE_SEC = 5  # beacon not seen for this long is ignored
EVAL_INTERVAL = 0.5  # seconds between engine evaluations / status lines
SWITCH_MARGIN_DB = 5  # another beacon must be this much stronger to switch zones
VOICE = "Daria"  # macOS Bulgarian voice
BEEP_SEC = 1  # debug mode: beep this often while in range
NEAR_RSSI = -50  # dBm: at or above this, speak at full volume
MIN_VOLUME = 0.2  # volume (0–1) at EXIT_RSSI or weaker
