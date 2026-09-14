import { describe, expect, test } from 'vitest';

import { directionOf, formatChangePercent, formatPrice, statusBarText, tooltipMarkdown } from '../format';
import type { Instrument, Quote } from '../providers/types';

const instrument: Instrument = { id: 'cn:600519', market: 'cn', code: '600519' };

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'cn:600519',
    market: 'cn',
    code: '600519',
    price: 1277.96,
    prevClose: 1275.16,
    change: 2.8,
    changePercent: 0.22,
    source: 'tencent',
    ...overrides,
  };
}

describe('formatPrice', () => {
  test('uses 2 decimals for A-shares and US stocks', () => {
    expect(formatPrice(1277.96, 'cn')).toBe('1277.96');
    expect(formatPrice(333.4, 'us')).toBe('333.40');
  });

  test('scales decimals for crypto prices', () => {
    expect(formatPrice(78372.01, 'crypto')).toBe('78372.01');
    expect(formatPrice(2498.78, 'crypto')).toBe('2498.78');
    expect(formatPrice(654.321, 'crypto')).toBe('654.321');
    expect(formatPrice(1.2345, 'crypto')).toBe('1.2345');
    expect(formatPrice(0.00001234, 'crypto')).toBe('0.00001234');
  });
});

describe('formatChangePercent', () => {
  test('always shows the sign of the change', () => {
    expect(formatChangePercent(0.22)).toBe('+0.22%');
    expect(formatChangePercent(-1.2)).toBe('-1.20%');
    expect(formatChangePercent(0)).toBe('0.00%');
    expect(formatChangePercent(undefined)).toBe('--');
  });
});

describe('directionOf', () => {
  test('classifies up, down and flat quotes', () => {
    expect(directionOf(quote())).toBe('up');
    expect(directionOf(quote({ changePercent: -0.5 }))).toBe('down');
    expect(directionOf(quote({ changePercent: 0 }))).toBe('flat');
    expect(directionOf(undefined)).toBe('flat');
  });
});

describe('statusBarText', () => {
  test('shows code, price and change percent', () => {
    expect(statusBarText({ instrument, quote: quote() })).toBe('$(graph) 600519 1277.96 +0.22%');
  });

  test('marks stale quotes with a warning icon', () => {
    expect(statusBarText({ instrument, quote: quote(), stale: true })).toBe('$(warning) 600519 1277.96 +0.22%');
  });

  test('shows a placeholder when the quote is missing', () => {
    expect(statusBarText({ instrument })).toBe('$(graph) 600519 --');
  });
});

describe('tooltipMarkdown', () => {
  test('lists every symbol with its price and change', () => {
    const markdown = tooltipMarkdown({
      rows: [
        { id: 'cn:600519', name: '贵州茅台', price: '1277.96', change: '+0.22%' },
        { id: 'cn:000001', name: '', price: '--', change: '--' },
      ],
      updatedAt: '2026-09-14 16:14:50',
      stale: false,
    });

    expect(markdown).toContain('| cn:600519 | 1277.96 | +0.22% | 贵州茅台 |');
    expect(markdown).toContain('| cn:000001 | -- | -- |');
    expect(markdown).toContain('Last updated 2026-09-14 16:14:50');
  });

  test('reports stale data and the last error', () => {
    const markdown = tooltipMarkdown({
      rows: [{ id: 'cn:600519', name: '', price: '1277.96', change: '+0.22%' }],
      stale: true,
      staleMessage: 'Quotes are stale',
      error: 'HTTP 500',
    });

    expect(markdown).toContain('Quotes are stale');
    expect(markdown).toContain('HTTP 500');
  });
});
