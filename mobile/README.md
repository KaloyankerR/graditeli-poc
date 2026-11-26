# Метро маяк (iPhone)

iPhone version of the beacon prototype in `..`. The iPhone listens for the Eddystone-UID beacons
(Android phones running nRF Connect, see `../README.md`) and for iPhone beacons (nRF Connect →
Peripheral, service UUID `6D657472-6F62-6561-636F-6E00000000NN` for zone `NN`, app in the foreground), shows the zone full-screen and speaks the
instruction in Bulgarian. Zones are in `src/zones.ts`, the zone logic in `src/zoneEngine.ts`
(port of `../zone_engine.py`), and the Bluetooth scanner is a local Swift module in
`modules/beacon-scanner`.

## Build and install (Release, runs without the Mac)

`npx expo run:ios --device` can't find the iPhone on Xcode 27 (its `xctrace` lookup is broken),
so build with `xcodebuild` and install with `devicectl`:

```bash
xcrun devicectl list devices      # iPhone UDID
xcodebuild -workspace ios/Metromayak.xcworkspace -scheme Metromayak -configuration Release \
  -destination id=<UDID> -derivedDataPath ios/build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=458S6ZD772 CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device <UDID> ios/build/Build/Products/Release-iphoneos/Metromayak.app
xcrun devicectl device process launch --device <UDID> com.kalo.metrobeacon
```

- Signs with the free Personal Team: the install expires after **7 days**. Rerun the commands above to renew.
- After changing `app.json` or native code, regenerate the project first:
  `npx expo prebuild --platform ios`, then `cd ios && LANG=en_US.UTF-8 pod install`
  (CocoaPods fails without a UTF-8 locale).
- First launch on a new install: Settings → General → VPN & Device Management → trust the developer.

## Using it

- Top right: packets per second and the strongest smoothed signal.
- **Задай тук**: stand where the instruction should play, point the top of the phone at the beacon
  and tap it. The entry threshold becomes the current signal − 2 dB (exit = entry − 8 dB) and the
  compass heading is saved as that beacon's direction. Both are remembered across restarts.
- **Само в посоката**: a zone is active only while the phone points within 30° of the saved direction
  (it stays active up to 45°). Otherwise the card says which way to turn. Uses the magnetic compass,
  which steel and motors disturb, so expect it to be less reliable in a real station.
- `−` / `+` move the entry distance closer / further (2 dB per step). Distances are estimates from
  `src/distance.ts` (−60 dBm at 1 m, path-loss exponent 2.2), roughly ±50%.
- By default the instruction is spoken only when you tap the yellow card. Turn on
  **Автоматичен глас при влизане** to speak on entering a zone. Leaving a zone stops the speech.
- Smoothing is the mean of the strongest half of the recent packets, so short drops from a body or
  wall in the way don't push the signal down. Entering uses the last 4 packets (~0.5 s) to react fast;
  leaving uses the last 8 (~1 s) so it doesn't flicker. This differs from the plain mean in `../zone_engine.py`.
- Tap the yellow card to repeat the instruction.
- Bulgarian voice: Settings → Accessibility → Spoken Content → Voices → Bulgarian → Daria.

## Checks

`npx tsc --noEmit` · `npm test` · `npx expo-doctor`
