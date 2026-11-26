# Metro BLE voice navigation – prototype

The Mac stands in for the blind user's phone. Android phones running nRF Connect act as
Eddystone-UID beacons. When the Mac gets close to a beacon, it reads that beacon's instruction
aloud in Bulgarian (voice: Daria). Everything runs offline.

| Instance       | Zone   | Instruction |
|----------------|--------|-------------|
| `000000000001` | Стълби | Стълби надолу, три метра пред вас. Перонът е вдясно. |
| `000000000002` | Перон  | Перон, посока Младост. Влакът спира пред вас. |

## Setup

```bash
cd graditeli-poc   # repo root
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

### macOS Bluetooth permission
System Settings → Privacy & Security → Bluetooth → turn on **Terminal** (or iTerm / VS Code,
whichever app runs the script). If scanning finds nothing and shows no error, this permission is
usually what's missing. Restart the terminal after you change it.

### Bulgarian voice (Daria)
System Settings → Accessibility → Spoken Content → System Voice → **Manage Voices…** →
Bulgarian → tick **Daria**. Check it with:

```bash
python main.py --voice-test
```

## nRF Connect beacon setup (each Android phone)

1. Open the **Advertiser** tab, tap **+** to add a new advertising packet.
2. Options: **Legacy advertising** (turn *Advertising Extension* off), *Include Tx Power*
   **off**, *Include device name* **off** (a legacy packet only holds 31 bytes).
3. Advertising data → Add record → **Service UUID** → `FEAA` (16-bit).
4. Add record → **Service Data** → UUID `FEAA`, data:
   - Stairs: `00C500000000000000000000000000000001`
   - Platform: `00C500000000000000000000000000000002`

   (`00` = UID frame, `C5` = Tx power, 10 zero bytes = namespace, last 6 bytes = instance.)
5. Set the interval to the fastest option and Tx power to high, then start advertising and keep
   the screen on.

macOS hides iBeacon packets and shows random device UUIDs instead of MAC addresses, so beacons
are identified only by their Eddystone instance.

## Usage

```bash
python main.py debug        # beeps every 1 s (louder = closer) while RSSI > --enter-rssi; logs each beep
python main.py calibrate    # smoothed RSSI; type a label (1m/3m/5m) + Enter to save to calibration.csv
python main.py run          # scan + zones + speech
python main.py run --enter-rssi -68 --exit-rssi -78   # override config.py values
```

Defaults are in `config.py`: ENTER −65, EXIT −75, WINDOW 3, STALE 5 s, tick 0.5 s, switch margin
5 dB.

Speech gets louder the closer you are: volume runs from `--min-volume` (0.2) at EXIT RSSI or
weaker up to full volume at `--near-rssi` (−50) or stronger.

Calibration suggests ENTER as the mean RSSI at the label closest to 3 m. It suggests EXIT as the
mean at the farthest label, kept at least 5 dB below ENTER.

## Test plan

1. **debug**: start one beacon and run `python main.py debug`. You should see lines like
   `rssi= -58  00 c5 00 … 00 01  -> Стълби`. If nothing shows up, check the Bluetooth
   permission and the nRF Connect records.
2. **calibrate at 1 / 3 / 5 m**: run `python main.py calibrate`. Hold the Mac at 1 m, wait about
   3 s, type `1m` and press Enter. Repeat at `3m` and `5m`, then press Enter on an empty line.
   Write down the suggested `--enter-rssi` / `--exit-rssi`.
3. **run**: run `python main.py run` with the suggested values. Walk toward the beacon. You
   should hear the instruction once, at about 3 m, and the status line should show `<< NEW`.
4. **walk between two beacons**: put the stairs and platform phones about 10 m apart and walk
   between them. Each zone should be announced once when you enter it. Standing in the middle
   should not cause flapping, and you should hear nothing new until you leave a zone and come
   back.
5. **Wi-Fi off**: turn off Wi-Fi (and unplug Ethernet) and repeat step 4. The behaviour should
   be identical, which confirms the prototype is fully offline.
