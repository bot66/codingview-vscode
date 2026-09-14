import { describe, expect, test } from 'vitest';

import { holdingFromEntry, profitLoss } from '../holdings';
import type { Quote } from '../providers/types';

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'cn:600519',
    market: 'cn',
    code: '600519',
    price: 110,
    currency: 'CNY',
    source: 'tencent',
    ...overrides,
  };
}

const maotai = { id: 'cn:600519', quantity: 10, cost: 100 };

describe('holdingFromEntry', () => {
  test('a plain symbol entry carries no holding', () => {
    expect(holdingFromEntry('cn:600519', 'cn:600519')).toEqual({});
  });

  test('an object entry carries the quantity and the cost basis', () => {
    expect(holdingFromEntry({ symbol: 'cn:600519', quantity: 10, cost: 100 }, 'cn:600519')).toEqual({
      holding: { id: 'cn:600519', quantity: 10, cost: 100 },
    });
  });

  test('rejects a quantity without a cost basis', () => {
    const result = holdingFromEntry({ symbol: 'cn:600519', quantity: 10 }, 'cn:600519');

    expect(result.holding).toBeUndefined();
    expect(result.error).toContain('"quantity" and "cost"');
  });

  test('rejects a non-positive quantity', () => {
    expect(holdingFromEntry({ symbol: 'cn:600519', quantity: 0, cost: 100 }, 'cn:600519').error).toContain(
      'quantity',
    );
  });

  test('rejects a negative cost basis', () => {
    expect(holdingFromEntry({ symbol: 'cn:600519', quantity: 1, cost: -1 }, 'cn:600519').error).toContain('cost');
  });

  test('rejects an entry that is neither a symbol string nor an object', () => {
    expect(holdingFromEntry(42, 'cn:600519').error).toContain('symbol');
  });
});

describe('profitLoss', () => {
  test('computes the market value, the cost and the percent', () => {
    expect(profitLoss(quote({ price: 110 }), maotai)).toEqual({ value: 1100, cost: 1000, profit: 100, percent: 10 });
  });

  test('reports a loss with a negative percent', () => {
    expect(profitLoss(quote({ price: 90 }), maotai)).toEqual({ value: 900, cost: 1000, profit: -100, percent: -10 });
  });

  test('has no profit and loss for a halted instrument', () => {
    expect(profitLoss(quote({ price: 0, halted: true }), maotai)).toBeUndefined();
  });

  test('omits the percent when the cost basis is zero', () => {
    const result = profitLoss(quote({ price: 10 }), { id: 'cn:600519', quantity: 2, cost: 0 });

    expect(result?.profit).toBe(20);
    expect(result?.percent).toBeUndefined();
  });
});
