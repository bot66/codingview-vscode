import { describe, expect, test } from 'vitest';

import { clampedSeconds } from '../settings';

describe('clampedSeconds', () => {
  test('keeps a finite value above the minimum', () => {
    expect(clampedSeconds(45, 60, 15)).toBe(45);
  });

  test('raises a value below the minimum', () => {
    expect(clampedSeconds(3, 60, 15)).toBe(15);
  });

  test('falls back when the setting is absent or not a number', () => {
    expect(clampedSeconds(undefined, 60, 15)).toBe(60);
    expect(clampedSeconds(Number.NaN, 60, 15)).toBe(60);
    expect(clampedSeconds('45', 60, 15)).toBe(60);
  });
});
