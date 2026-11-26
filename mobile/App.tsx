import { setAudioModeAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import BeaconScanner, { BluetoothState } from './modules/beacon-scanner';
import { angleDiff, isPointing } from './src/direction';
import { estimateDistanceM, formatDistance } from './src/distance';
import { ZoneEngine, volumeForRssi } from './src/zoneEngine';
import { ZONES } from './src/zones';

const DEFAULT_ENTER_RSSI = -71; // about where it should speak, measured with the Samsung beacon
const EXIT_GAP_DB = 8; // exit threshold = enter - this
const SET_HERE_MARGIN_DB = 2; // "set here" puts the threshold this far below the current signal
const ENTER_RSSI_KEY = 'enterRssi';
const AUTO_SPEAK_KEY = 'autoSpeak'; // 1 = speak on entering a zone, 0 = only when the card is tapped
const DIRECTION_LOCK_KEY = 'directionLock'; // 1 = a zone is active only while pointing at its beacon
const bearingKey = (instance: string) => `bearing_${instance}`; // heading saved by "set here"
const NEAR_RSSI = -50; // dBm: at or above this, speak at full volume and fill the bar
const MIN_VOLUME = 0.6; // volume at the exit threshold; kept high so it is audible on camera
const TICK_MS = 100; // how often the engine is evaluated
const RATE_WINDOW_MS = 3000; // packets/s is counted over this window

type Snapshot = {
  zone: string | null; // active zone: in range and, with the direction lock, pointed at
  nearZone: string | null; // in range, but not pointed at
  turnDeg: number | null; // signed degrees to turn towards nearZone's beacon
  strongest: string | null;
  rssi: number | null;
  rate: number;
};

const BT_MESSAGES: Partial<Record<BluetoothState, string>> = {
  poweredOff: 'Bluetooth е изключен',
  unauthorized: 'Разрешете Bluetooth: Настройки → Метро маяк',
  unsupported: 'Устройството не поддържа Bluetooth LE',
};

const storedFlag = (key: string) => BeaconScanner.getNumber(key) === 1;

export default function App() {
  useKeepAwake();
  const [enterRssi, setEnterRssi] = useState(() => BeaconScanner.getNumber(ENTER_RSSI_KEY) ?? DEFAULT_ENTER_RSSI);
  const [autoSpeak, setAutoSpeak] = useState(() => storedFlag(AUTO_SPEAK_KEY));
  const [directionLock, setDirectionLock] = useState(() => storedFlag(DIRECTION_LOCK_KEY));
  const [bt, setBt] = useState<BluetoothState>('unknown');
  const [snap, setSnap] = useState<Snapshot>({
    zone: null,
    nearZone: null,
    turnDeg: null,
    strongest: null,
    rssi: null,
    rate: 0,
  });
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [showControls, setShowControls] = useState(false); // hidden by default for a clean demo screen

  const engine = useRef(
    new ZoneEngine({
      enterRssi: DEFAULT_ENTER_RSSI,
      exitRssi: DEFAULT_ENTER_RSSI - EXIT_GAP_DB,
      window: 8, // about 1 s at the Samsung's ~8 packets/s
      enterWindow: 4, // about 0.5 s
      staleMs: 3000,
      switchMarginDb: 5,
    }),
  ).current;
  const packetTimes = useRef<number[]>([]);
  const voice = useRef<string | undefined>(undefined);
  const heading = useRef<number | null>(null);
  const pointing = useRef(false);
  const activeZone = useRef<string | null>(null);
  const options = useRef({ autoSpeak, directionLock });
  options.current = { autoSpeak, directionLock };

  const speakZone = (instance: string, rssi: number) => {
    const zone = ZONES[instance];
    const volume = volumeForRssi(rssi, engine.settings.exitRssi, NEAR_RSSI, MIN_VOLUME);
    Speech.stop();
    Speech.speak(`${zone.name}. ${zone.instruction}`, {
      language: 'bg-BG',
      voice: voice.current,
      volume,
    });
  };

  /** Threshold from the current signal and, if the compass works, the direction to the strongest beacon. */
  const setHere = () => {
    if (snap.rssi === null || snap.strongest === null) return;
    setEnterRssi(Math.round(snap.rssi) - SET_HERE_MARGIN_DB);
    if (heading.current !== null) BeaconScanner.setNumber(bearingKey(snap.strongest), heading.current);
  };

  useEffect(() => {
    engine.settings = {
      ...engine.settings,
      enterRssi,
      exitRssi: enterRssi - EXIT_GAP_DB,
    };
    BeaconScanner.setNumber(ENTER_RSSI_KEY, enterRssi);
    // `engine` is a ref's .current and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterRssi]);

  useEffect(() => BeaconScanner.setNumber(AUTO_SPEAK_KEY, autoSpeak ? 1 : 0), [autoSpeak]);
  useEffect(() => BeaconScanner.setNumber(DIRECTION_LOCK_KEY, directionLock ? 1 : 0), [directionLock]);

  useEffect(() => {
    // Speak even when the ringer switch is on silent.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    Speech.getAvailableVoicesAsync().then((voices) => {
      const bulgarian = voices.filter((v) => v.language.startsWith('bg'));
      voice.current = (bulgarian.find((v) => v.name.includes('Daria')) ?? bulgarian[0])?.identifier;
      setVoiceMissing(bulgarian.length === 0);
      // Load the voice now so the first real announcement starts without a delay.
      Speech.speak(' ', { language: 'bg-BG', voice: voice.current, volume: 0 });
    });

    const subscriptions = [
      BeaconScanner.addListener('onBeacon', ({ instance, rssi }) => {
        if (!(instance in ZONES)) return;
        engine.add(instance, rssi);
        packetTimes.current.push(Date.now());
      }),
      BeaconScanner.addListener('onState', ({ state }) => setBt(state)),
      BeaconScanner.addListener('onHeading', (e) => (heading.current = e.heading)),
    ];
    BeaconScanner.start();
    BeaconScanner.startHeading();

    const timer = setInterval(() => {
      engine.evaluate();
      const avgs = engine.averages();
      const inRange = engine.current;

      // With the direction lock, a zone whose beacon has a saved bearing is active only while pointed at.
      const bearing = inRange === null ? null : BeaconScanner.getNumber(bearingKey(inRange));
      const turnDeg = bearing === null || heading.current === null ? null : angleDiff(bearing, heading.current);
      pointing.current = turnDeg !== null && isPointing(turnDeg, pointing.current);
      const gated = options.current.directionLock && turnDeg !== null && !pointing.current;
      const active = gated ? null : inRange;

      if (active !== activeZone.current) {
        if (active !== null && options.current.autoSpeak) speakZone(active, avgs.get(active)!);
        else if (active === null) Speech.stop(); // left the zone or turned away mid-sentence
        activeZone.current = active;
      }

      const now = Date.now();
      packetTimes.current = packetTimes.current.filter((t) => now - t <= RATE_WINDOW_MS);
      let strongest: string | null = null;
      for (const [instance, avg] of avgs) if (strongest === null || avg > avgs.get(strongest)!) strongest = instance;
      setSnap({
        zone: active,
        nearZone: gated ? inRange : null,
        turnDeg,
        strongest,
        rssi: strongest === null ? null : avgs.get(strongest)!,
        rate: packetTimes.current.length / (RATE_WINDOW_MS / 1000),
      });
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      subscriptions.forEach((s) => s.remove());
      BeaconScanner.stop();
      BeaconScanner.stopHeading();
      Speech.stop();
    };
    // Runs once on mount. `engine` never changes, and `speakZone` and the timer read only refs,
    // so the first render's copies stay correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zone = snap.zone ? ZONES[snap.zone] : null;
  const proximity = snap.rssi === null ? 0 : volumeForRssi(snap.rssi, enterRssi - EXIT_GAP_DB, NEAR_RSSI, 0);
  const signal =
    snap.rssi === null ? '—' : `${Math.round(snap.rssi)} dBm ${formatDistance(estimateDistanceM(snap.rssi))}`;
  const warning =
    BT_MESSAGES[bt] ??
    (voiceMissing ? 'Няма български глас: Настройки → Достъпност → Изговорено съдържание → Гласове' : null);

  let idleText = 'Търсене на маяк…';
  if (snap.nearZone && snap.turnDeg !== null) {
    const side = snap.turnDeg > 0 ? '↷ надясно' : '↶ наляво';
    idleText = `${ZONES[snap.nearZone].name} е наблизо\nЗавъртете се ${side} (${Math.abs(Math.round(snap.turnDeg))}°)`;
  } else if (snap.rssi !== null) {
    idleText = 'Маякът е наблизо…';
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.header}>
        {showControls && (
          <Text style={styles.meta}>
            {snap.rate.toFixed(1)} пакета/с · {signal}
          </Text>
        )}
        <Pressable
          style={[styles.gear, showControls && styles.gearOn]}
          onPress={() => setShowControls((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={showControls ? 'Скрий настройките' : 'Покажи настройките'}>
          <Text style={styles.gearText}>⚙︎</Text>
        </Pressable>
      </View>
      {warning && <Text style={styles.warning}>{warning}</Text>}

      <Pressable
        style={[styles.card, zone && styles.cardActive]}
        disabled={!snap.zone}
        onPress={() => snap.zone && snap.rssi !== null && speakZone(snap.zone, snap.rssi)}
        accessibilityRole="button"
        accessibilityLabel={zone ? `${zone.name}. ${zone.instruction}` : idleText}
        accessibilityHint={zone ? 'Изговаря указанието' : undefined}>
        {zone ? (
          <>
            <Text style={styles.symbol}>{zone.symbol}</Text>
            <Text style={styles.zoneName}>{zone.name.toUpperCase()}</Text>
            <Text style={styles.instruction}>{zone.instruction}</Text>
            <Text style={styles.hint}>Докоснете, за да чуете указанието</Text>
          </>
        ) : (
          <Text style={styles.searching}>{idleText}</Text>
        )}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${proximity * 100}%` }, zone && styles.barFillActive]} />
        </View>
      </Pressable>

      {showControls && (
        <View style={styles.panel}>
          <View style={styles.row}>
            <Pressable
              style={styles.stepButton}
              onPress={() => setEnterRssi((v) => v + 2)}
              accessibilityLabel="По-близо">
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View style={styles.thresholdBox}>
              <Text style={styles.thresholdValue}>{formatDistance(estimateDistanceM(enterRssi))}</Text>
              <Text style={styles.thresholdLabel}>{enterRssi} dBm</Text>
            </View>
            <Pressable
              style={styles.stepButton}
              onPress={() => setEnterRssi((v) => v - 2)}
              accessibilityLabel="По-далече">
              <Text style={styles.stepText}>+</Text>
            </Pressable>
            <Pressable
              style={[styles.setHere, snap.rssi === null && styles.disabled]}
              disabled={snap.rssi === null}
              onPress={setHere}
              accessibilityRole="button"
              accessibilityLabel="Задай тук"
              accessibilityHint="Застанете на мястото, насочете телефона към маяка и докоснете">
              <Text style={styles.setHereText}>Задай тук</Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.toggle}>
              <Text style={styles.toggleLabel}>Автоматичен глас</Text>
              <Switch value={autoSpeak} onValueChange={setAutoSpeak} accessibilityLabel="Автоматичен глас" />
            </View>
            <View style={styles.toggle}>
              <Text style={styles.toggleLabel}>Само в посоката</Text>
              <Switch value={directionLock} onValueChange={setDirectionLock} accessibilityLabel="Само в посоката" />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B0D10',
    paddingTop: 64,
    paddingBottom: 36,
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    minHeight: 32,
  },
  meta: {
    flex: 1,
    color: '#8A93A0',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  gear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.35,
  },
  gearOn: { opacity: 1, backgroundColor: '#161A20' },
  gearText: { color: '#F2F4F7', fontSize: 18 },
  warning: {
    color: '#1A1300',
    backgroundColor: '#FFC940',
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#161A20',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  cardActive: { backgroundColor: '#FFC940' },
  symbol: {
    fontSize: 120,
    lineHeight: 130,
    color: '#0B0D10',
    fontWeight: '800',
  },
  zoneName: {
    fontSize: 52,
    color: '#0B0D10',
    fontWeight: '900',
    letterSpacing: 2,
  },
  instruction: {
    fontSize: 24,
    lineHeight: 32,
    color: '#0B0D10',
    textAlign: 'center',
    fontWeight: '600',
  },
  hint: { fontSize: 14, color: '#3D3214', marginTop: 8 },
  searching: {
    fontSize: 26,
    lineHeight: 36,
    color: '#8A93A0',
    fontWeight: '600',
    textAlign: 'center',
  },
  barTrack: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(138,147,160,0.25)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5, backgroundColor: '#8A93A0' },
  barFillActive: { backgroundColor: '#0B0D10' },
  panel: { backgroundColor: '#161A20', borderRadius: 24, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(138,147,160,0.35)',
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#232831',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#F2F4F7', fontSize: 26, fontWeight: '500' },
  thresholdBox: { flex: 1, alignItems: 'center' },
  thresholdValue: {
    color: '#F2F4F7',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  thresholdLabel: {
    color: '#8A93A0',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  setHere: {
    backgroundColor: '#F2F4F7',
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  setHereText: { color: '#0B0D10', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  toggleLabel: { color: '#F2F4F7', fontSize: 14, flexShrink: 1 },
});
