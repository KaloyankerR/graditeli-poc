# Handover: Graditeli metro beacon PoC

Status as of **2026-11-26**. This document is for the people taking over the project. It covers what
was built and why, what works, what doesn't, and where to go next. For setup and commands, see
[README.md](README.md) and the READMEs in each folder.

> **Previous owner:** _name and contact go here_ · **Repository:** [github.com/KaloyankerR/graditeli-poc](https://github.com/KaloyankerR/graditeli-poc) (public)

## 1. The idea in one paragraph

Blind and visually impaired passengers have no audio guidance inside metro stations. We place cheap
BLE beacons at key points (stairs, platform, escalator, exit). Each beacon broadcasts only an id. The
passenger's phone knows what each id means, notices when it is close to one, and speaks a short
instruction in Bulgarian. The phone does all the work offline: beacons need no power wiring or
network, and no data leaves the phone.

## 2. What was built, and in what order

| When | What | Why |
|---|---|---|
| 2026-10-17 | **Mac prototype** ([`mac/`](mac/)): Python + bleak. The Mac stands in for the phone and speaks with the macOS voice *Daria*. Includes `debug` (beeps near a beacon) and `calibrate` (records RSSI at 1/3/5 m and suggests thresholds). | Fastest way to prove that the beacon → zone → speech loop works. |
| 2026-10-29 | **iPhone app** ([`mobile/`](mobile/)): Expo + a local Swift CoreBluetooth module. Full-screen zone card, speech, on-device calibration ("Задай тук"), compass "point at the beacon" mode. | The Mac received only about **1 packet/s** of the beacon's ~8/s (measured with nRF Connect on an iPhone), too few for a responsive demo. The iPhone receives all of them. |
| 2026-10-29 | **Demo video** ([`video/`](video/)): 35 s animation rendered from HTML, with the Daria voice clips. | Public demo (TV interview). Not product code. |
| 2026-11-26 | Repository, cleanup (`mac/` folder, ruff, ESLint + Prettier), CI, these docs. | Handover. |

An earlier, unrelated experiment (a Gemini-based "Sofia Transit" voice assistant) was dropped and is
not in this repo.

## 3. What works (verified)

- An Android phone (Samsung) running nRF Connect as an **Eddystone-UID beacon** is detected by the iPhone
  app. The app shows **СТЪЛБИ** and speaks the instruction.
- An **iPhone as a beacon** (nRF Connect → Peripheral, service UUID `6D657472-6F62-6561-636F-6E00000000NN`)
  is detected while the beacon app is in the **foreground**.
- Four demo zones in the app: `01` Стълби, `02` Перон, `03` Ескалатор, `04` Изход ([`mobile/src/zones.ts`](mobile/src/zones.ts)).
- Entering, leaving and switching zones without flicker, covered by unit tests in both implementations
  (16 Python tests, 19 TypeScript tests).
- Volume rises as you get closer. The proximity bar fills up.
- Settings persist across restarts: entry threshold, auto-speak, direction lock and the bearing per beacon.

**Not verified:**
- A real metro station: steel, crowds, interference.
- More than one beacon at a time in a real space.
- The Mac `calibrate` flow: `calibration.csv` was never created.

## 4. How zone detection works

The same idea in [`mac/zone_engine.py`](mac/zone_engine.py) and [`mobile/src/zoneEngine.ts`](mobile/src/zoneEngine.ts):

1. Each advertisement gives `(instance id, RSSI)`. Unknown ids are ignored.
2. Readings are kept in a short window per beacon. A beacon not seen for `stale` seconds is dropped.
3. **Enter** a zone when the smoothed RSSI rises above `enterRssi`. **Leave** when it falls below
   `exitRssi`, which is lower (hysteresis, so standing at the edge doesn't flap).
4. **Switch** to another beacon only if it is at least `switchMarginDb` stronger.
5. The zone is announced once on entry, not again until you leave and come back.

Differences in the iPhone version:
- Smoothing is the **mean of the strongest half** of the readings. A body or wall only ever pushes RSSI
  *down*, so the strong readings track distance best.
- It uses two windows: 4 readings (~0.5 s) to enter, so it reacts fast, and 8 readings (~1 s) to leave,
  so it doesn't flicker.
- **Direction lock** (optional): a zone is active only while the top of the phone points within 30° of the
  bearing saved with "Задай тук". It stays active up to 45°.

Tuning constants are at the top of [`mobile/App.tsx`](mobile/App.tsx) and in [`mac/config.py`](mac/config.py).

## 5. Known limitations (read before promising features)

- **Distance is rough.** RSSI → distance is only good to about ±50%, and only within a few metres. An
  instruction like "stairs in 50 m" cannot come from the signal. Write it as **fixed text for the zone**:
  the beacon says "you are here", the text says what is ahead.
- **The compass is unreliable near steel and motors**, which a metro has plenty of. Direction lock is
  off by default.
- **Foreground only.** The app has no background Bluetooth mode: the screen must be on and the app open.
  `expo-keep-awake` keeps the screen on.
- **iOS only.** The Swift scanner module has no Android counterpart. The Android template config was removed.
- **Signing uses a free Apple Personal Team** (team `458S6ZD772`, bundle id `com.kalo.metrobeacon`):
  - installs expire after **7 days**;
  - only the previous owner can sign with that team.

  Use your own team id and bundle id.
- **`npx expo run:ios --device` doesn't find the iPhone on Xcode 27.** Use the `xcodebuild` + `devicectl`
  commands in [mobile/README.md](mobile/README.md).
- **Zones are hard-coded in two places**: [`mobile/src/zones.ts`](mobile/src/zones.ts) and [`mac/zones.json`](mac/zones.json).
  Only `01` and `02` overlap. There is no way to change zones without a new build.
- **Mac prototype**:
  - It is macOS-only (`say`, `afplay`, CoreBluetooth).
  - It patches bleak's internal `CentralManagerDelegate.start_scan` to turn on duplicate reports
    ([`mac/main.py`](mac/main.py) `report_every_advertisement`), which can break on a bleak upgrade.
- **Beacons are phones running nRF Connect.** The screen must stay on, and Tx power and interval vary by phone.

## 6. Next steps

Roughly in priority order:

1. **Test in a real station** with 2–4 beacons. Re-tune `enterRssi`, the windows and the margins. Write down the results.
2. **Real beacon hardware** (dedicated Eddystone/iBeacon tags) instead of phones. Measure RSSI at 1 m and update `RSSI_AT_1M`.
3. **Paid Apple Developer account + TestFlight** (or EAS Build), so testers can install without a Mac and without the 7-day expiry.
4. **iOS build in CI** on a `macos` runner, once signing is sorted out.
5. **One source of zones**: e.g. a JSON file per station, loaded by the app. Possibly downloadable, while still working offline.
6. **Background scanning** (`bluetooth-central` background mode) so the phone can stay in a pocket.
7. **Accessibility review with real users**: VoiceOver behaviour, speech rate, what an instruction should say.
8. **Android app**, if needed: a Kotlin scanner module with the same events as the Swift one.

## 7. Access to hand over

- [ ] GitHub: add the new owners as collaborators (the repo is public, but pushing needs an invite), or transfer the repository.
- [ ] Apple: each developer signs with their own team, or set up a shared paid team.
- [ ] Beacon phones: which devices were used and their nRF Connect advertiser setup (see [mac/README.md](mac/README.md)).
