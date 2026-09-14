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

  test('rejects an unsupported market', () => {
    expect(() => parseInstrument('hk:00700')).toThrowError('Unsupported market');
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

  test('rejects crypto pairs for the stock providers', () => {
    const bitcoin = parseInstrument('crypto:BTCUSDT');

    expect(() => tencentSymbol(bitcoin)).toThrowError('does not support');
    expect(() => sinaSymbol(bitcoin)).toThrowError('does not support');
  });
});
