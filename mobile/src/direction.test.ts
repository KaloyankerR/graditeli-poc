import { angleDiff, isPointing } from './direction';

test('angle difference wraps around north and gives the turn side', () => {
  expect(angleDiff(10, 350)).toBe(20); // turn right across north
  expect(angleDiff(350, 10)).toBe(-20); // turn left across north
  expect(angleDiff(90, 90)).toBe(0);
  expect(Math.abs(angleDiff(180, 0))).toBe(180);
  expect(angleDiff(0, 720 + 30)).toBe(-30);
});

test('pointing has hysteresis', () => {
  expect(isPointing(25, false)).toBe(true);
  expect(isPointing(40, false)).toBe(false); // not yet pointing: needs 30°
  expect(isPointing(40, true)).toBe(true); // already pointing: allowed up to 45°
  expect(isPointing(-50, true)).toBe(false);
});
