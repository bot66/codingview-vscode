import { describe, expect, test } from 'vitest';

import { clampedSeconds } from '../settings';

describe('clampedSeconds', () => {
  test('keeps a finite value above the minimum', () => {
    expect(clampedSeconds(45, 30, 15)).toBe(45);
  });

  test('raises a value below the minimum', () => {
    expect(clampedSeconds(3, 30, 15)).toBe(15);
  });

  test('falls back when the setting is absent or not a number', () => {
    expect(clampedSeconds(undefined, 30, 15)).toBe(30);
    expect(clampedSeconds(Number.NaN, 30, 15)).toBe(30);
    expect(clampedSeconds('45', 30, 15)).toBe(30);
  });
});
