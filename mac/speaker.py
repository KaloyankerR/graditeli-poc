"""Non-blocking text-to-speech via macOS `say`, with adjustable volume."""

import os
import signal
import subprocess
import tempfile

# Daria ignores say's [[volm]] command, so render to a file and play it with afplay -v.
SAY_THEN_PLAY = 'say -v "$0" -o "$1" "$2" && exec afplay -v "$3" "$1"'


class Speaker:
    def __init__(self, voice):
        self.voice = voice
        self._proc = None
        self._audio = os.path.join(tempfile.gettempdir(), f"speaker-{os.getpid()}.aiff")

    def say(self, text, volume=1.0):
        """Start speaking at volume 0–1, interrupting any previous utterance. Returns immediately."""
        self.stop()
        self._proc = subprocess.Popen(
            ["sh", "-c", SAY_THEN_PLAY, self.voice, self._audio, text, f"{volume:.2f}"],
            start_new_session=True,
        )

    def stop(self):
        if self._proc and self._proc.poll() is None:
            os.killpg(self._proc.pid, signal.SIGTERM)
            self._proc.wait()

    def wait(self):
        if self._proc:
            self._proc.wait()


BEEP_SOUND = "/System/Library/Sounds/Tink.aiff"


def beep(volume=1.0):
    """Play a short beep without blocking."""
    subprocess.Popen(["afplay", "-v", f"{volume:.2f}", BEEP_SOUND])


def volume_for_rssi(rssi, far_rssi, near_rssi, min_volume):
    """Map RSSI linearly to volume: far_rssi (or weaker) -> min_volume, near_rssi (or stronger) -> 1."""
    frac = (rssi - far_rssi) / (near_rssi - far_rssi)
    return min_volume + (1 - min_volume) * max(0.0, min(1.0, frac))


def voice_available(voice):
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    return any(line.startswith(voice) for line in out.splitlines())
