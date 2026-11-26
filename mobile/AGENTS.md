This is the "Метро маяк" iPhone app: an Expo / React Native app with one screen ([App.tsx](App.tsx)) and a local
Swift module ([modules/beacon-scanner](modules/beacon-scanner)) that scans for BLE beacons. It is iOS-only. See
[README.md](README.md) for build steps and [../HANDOVER.md](../HANDOVER.md) for the background.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

```bash
npx expo install <package>  # ALWAYS use instead of npm install <package>: resolves SDK-compatible versions
npm run lint                # eslint (eslint-config-expo + prettier)
npm run format              # prettier --write
npm run typecheck           # tsc --noEmit
npm test                    # jest
npx expo-doctor             # dependency and config issues
```

Run lint, format:check, typecheck and tests before declaring any task done. CI runs the same.

## Layout

- `App.tsx`: the whole UI, the timer loop and the tuning constants.
- `src/zoneEngine.ts`: zone detection. Pure logic, unit-tested, port of `../mac/zone_engine.py`.
- `src/zones.ts`: beacon instance id → zone name, symbol, instruction. Zones `01`/`02` must match `../mac/zones.json`.
- `src/distance.ts`, `src/direction.ts`: RSSI → metres estimate, compass helpers.
- `modules/beacon-scanner/`: Swift CoreBluetooth scanner, compass heading and a small UserDefaults store, exposed to JS as `BeaconScanner`.

Keep logic that can be tested out of `App.tsx` and in `src/`, with a test next to it.

## Rules

- `ios/` is generated (`npx expo prebuild --platform ios`) and not committed. Never edit it by hand. Configure native behaviour in `app.json`, and put native code in `modules/beacon-scanner/`.
- There is no navigation library and no EAS setup. Builds use `xcodebuild` + `devicectl` (see README).
- Native changes need a rebuild. Expo Go cannot run this app because of the custom module.
