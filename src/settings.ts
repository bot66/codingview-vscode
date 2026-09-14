/**
 * Defaults and floors for the numeric `codingview.*` settings. Kept free of `vscode`
 * imports so the clamping rules can be unit tested under plain Node.
 */
export const SETTINGS_DEFAULTS = {
  refreshIntervalSeconds: 60,
  rotateIntervalSeconds: 5,
  requestTimeoutSeconds: 8,
} as const;

export const SETTINGS_MINIMUMS = {
  refreshIntervalSeconds: 15,
  rotateIntervalSeconds: 2,
  requestTimeoutSeconds: 2,
} as const;

export type SecondsSetting = keyof typeof SETTINGS_DEFAULTS;

/** Reads a seconds setting, clamped to its floor, falling back when it is not a finite number. */
export function clampedSeconds(value: unknown, fallback: number, minimum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}
