import { describe, expect, test } from 'vitest';

import { exchangePrefix, parseInstrument, parseWatchlist, sinaSymbol, tencentSymbol } from '../symbols';

describe('parseInstrument', () => {
  test('parses an A-share code with the cn prefix', () => {
    expect(parseInstrument('cn:600519')).toEqual({ id: 'cn:600519', market: 'cn', code: '600519' });
  });

  test('uppercases US tickers and keeps dotted tickers', () => {
    expect(parseInstrument('us:brk.b').id).toBe('us:BRK.B');
  });

  test('uppercases crypto pairs', () => {
    expect(parseInstrument('crypto:btcusdt').id).toBe('crypto:BTCUSDT');
  });

  test('tolerates surrounding whitespace', () => {
    expect(parseInstrument('  cn:600519  ').id).toBe('cn:600519');
  });

  test('rejects a symbol without a market prefix', () => {
    expect(() => parseInstrument('600519')).toThrowError('Missing market prefix');
  });

  test('zero pads Hong Kong codes to five digits', () => {
    expect(parseInstrument('hk:700')).toEqual({ id: 'hk:00700', market: 'hk', code: '00700' });
    expect(parseInstrument('hk:09988').id).toBe('hk:09988');
  });

  test('rejects an unsupported market', () => {
    expect(() => parseInstrument('jp:7203')).toThrowError('Unsupported market');
  });

  test('rejects a Hong Kong code that is not up to five digits', () => {
    expect(() => parseInstrument('hk:123456')).toThrowError('Hong Kong codes');
  });

  test('rejects an A-share code that is not 6 digits', () => {
    expect(() => parseInstrument('cn:6005')).toThrowError('6 digits');
  });

  test('rejects a US ticker that does not look like one', () => {
    expect(() => parseInstrument('us:123')).toThrowError('US tickers');
  });
});

describe('parseWatchlist', () => {
  test('drops duplicates and reports invalid entries', () => {
    const { instruments, invalid } = parseWatchlist(['cn:600519', 'cn:600519', 'us:aapl', 'us:AAPL', '600519']);

    expect(instruments.map((instrument) => instrument.id)).toEqual(['cn:600519', 'us:AAPL']);
    expect(invalid).toEqual([{ entry: '600519', reason: expect.stringContaining('Missing market prefix') }]);
  });

  test('keeps the pinned symbol out of the rotating list', () => {
    const result = parseWatchlist(['cn:600519', 'us:AAPL'], 'us:AAPL');

    expect(result.pinned?.id).toBe('us:AAPL');
    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['cn:600519']);
  });

  test('keeps a pinned symbol that is not in the watchlist', () => {
    const result = parseWatchlist(['cn:600519'], 'hk:700');

    expect(result.pinned?.id).toBe('hk:00700');
    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['cn:600519']);
  });

  test('reports an unparseable pin and keeps rotating the rest', () => {
    const result = parseWatchlist(['cn:600519'], 'nope');

    expect(result.pinned).toBeUndefined();
    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['cn:600519']);
    expect(result.invalid).toEqual([{ entry: 'nope', reason: expect.stringContaining('Missing market prefix') }]);
  });

  test('treats a blank pin as unpinned', () => {
    const result = parseWatchlist(['cn:600519'], '   ');

    expect(result.pinned).toBeUndefined();
    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['cn:600519']);
    expect(result.invalid).toEqual([]);
  });

  test('reads holdings from object entries', () => {
    const result = parseWatchlist([
      { symbol: 'cn:600519', quantity: 10, cost: 1200.5 },
      'us:AAPL',
    ]);

    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['cn:600519', 'us:AAPL']);
    expect(result.holdings.get('cn:600519')).toEqual({ id: 'cn:600519', quantity: 10, cost: 1200.5 });
    expect(result.holdings.has('us:AAPL')).toBe(false);
  });

  test('reports an object entry without a usable symbol', () => {
    const result = parseWatchlist([{ quantity: 10, cost: 5 }]);

    expect(result.instruments).toEqual([]);
    expect(result.invalid[0].reason).toContain('symbol');
  });

  test('reports an object entry whose holding is incomplete', () => {
    const result = parseWatchlist([{ symbol: 'cn:600519', quantity: 10 }]);

    expect(result.instruments).toEqual([]);
    expect(result.invalid[0]).toEqual({
      entry: 'cn:600519',
      reason: expect.stringContaining('"quantity" and "cost"'),
    });
  });
});

describe('exchangePrefix', () => {
  test.each([
    ['600519', 'sh'],
    ['688981', 'sh'],
    ['510300', 'sh'],
    ['900901', 'sh'],
    ['000001', 'sz'],
    ['300750', 'sz'],
    ['159915', 'sz'],
    ['200002', 'sz'],
    ['430047', 'bj'],
    ['830799', 'bj'],
    ['871981', 'bj'],
    ['920002', 'bj'],
  ])('maps %s to %s', (code, prefix) => {
    expect(exchangePrefix(code)).toBe(prefix);
  });

  test('rejects a code it cannot map', () => {
    expect(() => exchangePrefix('700001')).toThrowError('Cannot infer');
  });
});

describe('provider symbols', () => {
  test('builds Tencent symbols', () => {
    expect(tencentSymbol(parseInstrument('cn:600519'))).toBe('sh600519');
    expect(tencentSymbol(parseInstrument('us:aapl'))).toBe('usAAPL');
  });

  test('builds Sina symbols', () => {
    expect(sinaSymbol(parseInstrument('cn:000001'))).toBe('sz000001');
    expect(sinaSymbol(parseInstrument('us:AAPL'))).toBe('gb_aapl');
  });

  test('builds Hong Kong symbols for both stock providers', () => {
    const tencent = parseInstrument('hk:700');

    expect(tencentSymbol(tencent)).toBe('hk00700');
    expect(sinaSymbol(parseInstrument('hk:09988'))).toBe('rt_hk09988');
  });

  test('rejects crypto pairs for the stock providers', () => {
    const bitcoin = parseInstrument('crypto:BTCUSDT');

    expect(() => tencentSymbol(bitcoin)).toThrowError('does not support');
    expect(() => sinaSymbol(bitcoin)).toThrowError('does not support');
  });
});
