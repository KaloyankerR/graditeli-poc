import { estimateDistanceM, formatDistance } from './distance';

test('distance follows the path-loss model', () => {
  expect(estimateDistanceM(-60)).toBeCloseTo(1);
  expect(estimateDistanceM(-82)).toBeCloseTo(10);
  expect(estimateDistanceM(-69)).toBeCloseTo(2.565, 3);
  expect(estimateDistanceM(-50)).toBeLessThan(1);
});

test('formats in Bulgarian', () => {
  expect(formatDistance(2.56)).toBe('≈ 2,6 м');
  expect(formatDistance(12.4)).toBe('≈ 12 м');
  expect(formatDistance(0.3)).toBe('< 0,5 м');
});
