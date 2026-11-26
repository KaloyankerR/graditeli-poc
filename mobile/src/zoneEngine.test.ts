import { ZoneEngine, upperMean, volumeForRssi } from './zoneEngine';

const A = '000000000001';
const B = '000000000002';

let t = 0;
let engine: ZoneEngine;

beforeEach(() => {
  t = 0;
  engine = new ZoneEngine(
    { enterRssi: -65, exitRssi: -75, window: 5, enterWindow: 5, staleMs: 3000, switchMarginDb: 5 },
    () => t,
  );
});

function feed(instance: string, values: number[], dtMs = 100) {
  for (const v of values) {
    t += dtMs;
    engine.add(instance, v);
  }
}

const entered = (events: (string | null)[]) => events.filter((e) => e !== null);

test('enter', () => {
  feed(A, Array(5).fill(-60));
  expect(engine.evaluate()).toBe(A);
  expect(engine.current).toBe(A);
});

test('weak beacon does not enter', () => {
  feed(A, Array(5).fill(-70));
  expect(engine.evaluate()).toBeNull();
  expect(engine.current).toBeNull();
});

test('leave then re-enter announces again', () => {
  feed(A, Array(5).fill(-60));
  expect(engine.evaluate()).toBe(A);
  feed(A, Array(5).fill(-80));
  expect(engine.evaluate()).toBeNull();
  expect(engine.current).toBeNull();
  feed(A, Array(5).fill(-60));
  expect(engine.evaluate()).toBe(A);
});

test('stale beacon leaves zone', () => {
  feed(A, Array(5).fill(-60));
  expect(engine.evaluate()).toBe(A);
  t += 3500;
  expect(engine.averages().size).toBe(0);
  expect(engine.evaluate()).toBeNull();
  expect(engine.current).toBeNull();
});

test('stale readings are discarded on return', () => {
  feed(A, Array(5).fill(-50));
  t += 5000;
  feed(A, [-80]);
  expect(engine.averages()).toEqual(new Map([[A, -80]]));
});

test('no duplicate announcements', () => {
  const events = [];
  for (let i = 0; i < 20; i++) {
    feed(A, [-60]);
    events.push(engine.evaluate());
  }
  expect(entered(events)).toEqual([A]);
});

test('switch requires margin', () => {
  feed(A, Array(5).fill(-60));
  expect(engine.evaluate()).toBe(A);
  feed(B, Array(5).fill(-57)); // only 3 dB stronger
  expect(engine.evaluate()).toBeNull();
  expect(engine.current).toBe(A);
  feed(B, Array(5).fill(-50)); // 10 dB stronger
  expect(engine.evaluate()).toBe(B);
  expect(engine.current).toBe(B);
});

test('noisy RSSI around threshold does not flap', () => {
  const noise = Array(4).fill([-62, -68, -64, -70, -61, -67, -66, -63, -72, -60]).flat();
  const events = [];
  for (const v of noise) {
    feed(A, [v]);
    events.push(engine.evaluate());
  }
  expect(entered(events)).toEqual([A]);
  expect(engine.current).toBe(A);
});

test('noisy two beacons do not flap', () => {
  const events = [];
  for (let i = 0; i < 40; i++) {
    feed(A, [-60 + (i % 3) - 1]);
    feed(B, [-61 + (i % 4) - 2]);
    events.push(engine.evaluate());
  }
  expect(entered(events)).toHaveLength(1);
});

test('window change applies to existing readings', () => {
  feed(A, [-50, -50, -50, -80, -80]);
  engine.settings = { ...engine.settings, window: 3 };
  expect(engine.averages().get(A)).toBe(-65); // strongest half of [-50, -80, -80]
});

test('short signal drops do not leave the zone', () => {
  feed(A, Array(5).fill(-62));
  expect(engine.evaluate()).toBe(A);
  feed(A, [-62, -95, -62, -95, -62]); // body blocking two packets; a plain mean (-75.2) would leave
  expect(engine.evaluate()).toBeNull();
  expect(engine.current).toBe(A);
});

describe('fast entry window', () => {
  beforeEach(() => {
    engine.settings = { ...engine.settings, window: 8, enterWindow: 4 };
  });

  test('enters after two strong packets despite a weak history', () => {
    feed(A, Array(8).fill(-80));
    expect(engine.evaluate()).toBeNull();
    feed(A, [-62]);
    expect(engine.evaluate()).toBeNull(); // top 2 of last 4 = (-62, -80)
    feed(A, [-62]);
    expect(engine.evaluate()).toBe(A);
  });

  test('still leaves on the slow window and does not flap', () => {
    const noise = Array(4).fill([-62, -68, -64, -70, -61, -67, -66, -63, -72, -60]).flat();
    const events = [];
    for (const v of noise) {
      feed(A, [v]);
      events.push(engine.evaluate());
    }
    expect(entered(events)).toEqual([A]);
    feed(A, Array(8).fill(-82));
    expect(engine.evaluate()).toBeNull();
    expect(engine.current).toBeNull();
  });
});

test('upper mean ignores the weaker half', () => {
  expect(upperMean([-60, -90, -62, -95])).toBe(-61);
  expect(upperMean([-70])).toBe(-70);
  expect(upperMean([-60, -70, -80])).toBe(-65); // top 2 of 3
});

test('volume scales with RSSI and is clamped', () => {
  expect(volumeForRssi(-50, -75, -50, 0.2)).toBe(1);
  expect(volumeForRssi(-75, -75, -50, 0.2)).toBe(0.2);
  expect(volumeForRssi(-62.5, -75, -50, 0.2)).toBeCloseTo(0.6);
  expect(volumeForRssi(-40, -75, -50, 0.2)).toBe(1);
  expect(volumeForRssi(-95, -75, -50, 0.2)).toBe(0.2);
});
