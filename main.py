"""BLE beacon voice navigation prototype.

Modes:  run (default) | calibrate | debug      Extra:  --voice-test
"""

import argparse
import asyncio
import csv
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from bleak import BleakScanner

import config
from eddystone import parse_instance
from speaker import Speaker, beep, voice_available, volume_for_rssi
from zone_engine import ZoneEngine

HERE = Path(__file__).parent
ZONES_PATH = HERE / "zones.json"
CALIBRATION_PATH = HERE / "calibration.csv"
TARGET_ENTER_M = 3  # announce roughly this far from the beacon
VOICE_MISSING = ("WARNING: voice '{}' not installed. System Settings → Accessibility → "
                 "Spoken Content → System Voice → Manage Voices… → Bulgarian.")


def report_every_advertisement():
    """bleak starts the macOS scan without options, so CoreBluetooth merges repeated
    advertisements and reports a beacon only every few seconds. Turn on AllowDuplicates.
    (Ignores service_uuids – we never filter by service.)"""
    if sys.platform != "darwin":
        return
    from bleak.backends.corebluetooth.CentralManagerDelegate import CentralManagerDelegate
    from CoreBluetooth import CBCentralManagerScanOptionAllowDuplicatesKey

    async def start_scan(self, service_uuids):
        self.central_manager.scanForPeripheralsWithServices_options_(
            None, {CBCentralManagerScanOptionAllowDuplicatesKey: True})

    CentralManagerDelegate.start_scan = start_scan


def make_engine(args):
    return ZoneEngine(args.enter_rssi, args.exit_rssi, args.window, args.stale_sec,
                      args.switch_margin_db)


def volume(args, rssi):
    return volume_for_rssi(rssi, args.exit_rssi, args.near_rssi, args.min_volume)


def zone_name(zones, instance):
    return zones.get(instance, {}).get("name", instance)


def format_avgs(avgs, zones):
    if not avgs:
        return "no beacons"
    return "  ".join(f"{zone_name(zones, i)}:{a:.0f}" for i, a in sorted(avgs.items()))


def now():
    return datetime.now().strftime("%H:%M:%S")


async def run(args, zones):
    if not voice_available(args.voice):
        print(VOICE_MISSING.format(args.voice))
    engine = make_engine(args)
    speaker = Speaker(args.voice)

    def on_adv(device, adv):
        instance = parse_instance(adv.service_data)
        if instance in zones:
            engine.add(instance, adv.rssi)

    async with BleakScanner(detection_callback=on_adv):
        print("Scanning… Ctrl+C to stop")
        while True:
            await asyncio.sleep(args.eval_interval)
            entered = engine.evaluate()
            avgs = engine.averages()
            zone = zone_name(zones, engine.current) if engine.current else "-"
            mark = f"  << NEW (volume {volume(args, avgs[entered]):.2f})" if entered else ""
            print(f"{now()}  {format_avgs(avgs, zones)}  | zone: {zone}{mark}")
            if entered:
                zone_info = zones[entered]
                text = f"{zone_info['name']}. {zone_info['instruction']}"
                vol = volume(args, avgs[entered])
                print(f"{now()}  SAY   volume={vol:.2f}  {text}")
                speaker.say(text, vol)


async def calibrate(args, zones):
    engine = make_engine(args)
    samples = []  # (label, instance, avg_rssi)

    def on_adv(device, adv):
        instance = parse_instance(adv.service_data)
        if instance:
            engine.add(instance, adv.rssi)

    lines = asyncio.Queue()
    loop = asyncio.get_running_loop()
    loop.add_reader(sys.stdin, lambda: lines.put_nowait(sys.stdin.readline()))
    print("Type a label (e.g. 1m, 3m, 5m) and press Enter to record a sample.\n"
          "Empty line + Enter finishes. (Output keeps scrolling while you type.)")
    try:
        async with BleakScanner(detection_callback=on_adv):
            while True:
                try:
                    line = await asyncio.wait_for(lines.get(), args.eval_interval)
                except TimeoutError:
                    print(f"{now()}  {format_avgs(engine.averages(), zones)}")
                    continue
                label = line.strip()
                if not label:
                    break
                avgs = engine.averages()
                if not avgs:
                    print("No beacons visible – sample not recorded.")
                    continue
                record_samples(label, avgs)
                samples += [(label, i, a) for i, a in avgs.items()]
                print(f"Recorded '{label}': {format_avgs(avgs, zones)}")
    finally:
        loop.remove_reader(sys.stdin)
    print_suggestions(samples, zones)


def record_samples(label, avgs):
    new_file = not CALIBRATION_PATH.exists()
    with CALIBRATION_PATH.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["timestamp", "label", "instance", "avg_rssi"])
        ts = datetime.now().isoformat(timespec="seconds")
        for instance, avg in avgs.items():
            w.writerow([ts, label, instance, f"{avg:.1f}"])


def distance(label):
    m = re.search(r"\d+(\.\d+)?", label)
    return float(m.group()) if m else float("inf")


def print_suggestions(samples, zones):
    """ENTER = mean RSSI at the label closest to 3 m; EXIT = mean at the farthest label,
    but at least 5 dB below ENTER."""
    by_beacon = {}
    for label, instance, avg in samples:
        by_beacon.setdefault(instance, {}).setdefault(label, []).append(avg)

    print("\n--- Suggestions ---")
    for instance, per_label in sorted(by_beacon.items()):
        means = {l: sum(v) / len(v) for l, v in per_label.items()}
        labels = sorted(means, key=distance)
        print(f"{zone_name(zones, instance)}: " +
              ", ".join(f"{l}={means[l]:.1f}" for l in labels))
        if len(labels) < 2:
            print("  need at least two distances for a suggestion")
            continue
        enter = round(means[min(labels, key=lambda l: abs(distance(l) - TARGET_ENTER_M))])
        exit_ = min(round(means[labels[-1]]), enter - 5)
        print(f"  suggested: --enter-rssi {enter} --exit-rssi {exit_}")


async def debug(args, zones):
    last_close = {}  # instance -> (monotonic time, rssi) of last packet stronger than --enter-rssi

    def on_adv(device, adv):
        instance = parse_instance(adv.service_data)
        if instance in zones and adv.rssi > args.enter_rssi:
            last_close[instance] = (time.monotonic(), adv.rssi)

    async with BleakScanner(detection_callback=on_adv):
        print("Listening for FEAA advertisements… Ctrl+C to stop")
        # Beep every --beep-sec while any beacon had an in-range packet within --stale-sec.
        while True:
            await asyncio.sleep(args.beep_sec)
            t = time.monotonic()
            near = [(rssi, i) for i, (seen, rssi) in last_close.items()
                    if t - seen <= args.stale_sec]
            if near:
                rssi, instance = max(near)
                vol = volume(args, rssi)
                print(f"{now()}  BEEP  volume={vol:.2f}  {zone_name(zones, instance)} rssi={rssi}")
                beep(vol)


def voice_test(args):
    if not voice_available(args.voice):
        print(VOICE_MISSING.format(args.voice))
    speaker = Speaker(args.voice)
    speaker.say("Тест на гласа. Перон, посока Младост.")
    speaker.wait()


def main():
    p = argparse.ArgumentParser(description="BLE beacon voice navigation prototype")
    p.add_argument("mode", nargs="?", default="run", choices=["run", "calibrate", "debug"])
    p.add_argument("--voice-test", action="store_true", help="speak a test sentence and exit")
    p.add_argument("--enter-rssi", type=float, default=config.ENTER_RSSI)
    p.add_argument("--exit-rssi", type=float, default=config.EXIT_RSSI)
    p.add_argument("--window", type=int, default=config.WINDOW)
    p.add_argument("--stale-sec", type=float, default=config.STALE_SEC)
    p.add_argument("--eval-interval", type=float, default=config.EVAL_INTERVAL)
    p.add_argument("--switch-margin-db", type=float, default=config.SWITCH_MARGIN_DB)
    p.add_argument("--voice", default=config.VOICE)
    p.add_argument("--beep-sec", type=float, default=config.BEEP_SEC)
    p.add_argument("--near-rssi", type=float, default=config.NEAR_RSSI)
    p.add_argument("--min-volume", type=float, default=config.MIN_VOLUME)
    args = p.parse_args()

    if args.voice_test:
        voice_test(args)
        return
    report_every_advertisement()
    zones = json.loads(ZONES_PATH.read_text(encoding="utf-8"))
    mode = {"run": run, "calibrate": calibrate, "debug": debug}[args.mode]
    try:
        asyncio.run(mode(args, zones))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
