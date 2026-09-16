import { describe, expect, test } from 'vitest';

import {
  compactCryptoPair,
  exchangePrefix,
  parseInstrument,
  parseWatchlist,
  sinaSymbol,
  splitCryptoPair,
  tencentSymbol,
} from '../symbols';

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

  test('leaves an unqualified crypto pair without a source', () => {
    expect(parseInstrument('crypto:BTCUSDT')).toEqual({
      id: 'crypto:BTCUSDT',
      market: 'crypto',
      code: 'BTCUSDT',
    });
  });

  test('parses a crypto pair qualified by its source', () => {
    expect(parseInstrument('crypto:gate:LIT_USDT')).toEqual({
      id: 'crypto:gate:LITUSDT',
      market: 'crypto',
      code: 'LITUSDT',
      source: 'gate',
    });
    expect(parseInstrument('crypto:binance:BTCUSDT').id).toBe('crypto:binance:BTCUSDT');
  });

  test('normalizes the source and the pair regardless of case', () => {
    expect(parseInstrument('crypto:Gate:lit_usdt').id).toBe('crypto:gate:LITUSDT');
  });

  test('keeps the separator when the base code itself has one', () => {
    expect(parseInstrument('crypto:gate:LITE_OLD_USDT').id).toBe('crypto:gate:LITE_OLD_USDT');
  });

  test('spells a qualified pair the same way with and without the separator', () => {
    expect(parseInstrument('crypto:gate:LIT_USDT').id).toBe(parseInstrument('crypto:gate:LITUSDT').id);
  });

  test('leaves an unqualified pair exactly as written', () => {
    expect(parseInstrument('crypto:LIT_USDT').id).toBe('crypto:LIT_USDT');
    expect(parseInstrument('crypto:BTCUSDT').id).toBe('crypto:BTCUSDT');
  });

  test('rejects a crypto source that is not a known one', () => {
    expect(() => parseInstrument('crypto:okx:BTCUSDT')).toThrowError('Unsupported crypto source');
  });

  test('rejects a crypto pair with characters outside the grammar', () => {
    expect(() => parseInstrument('crypto:gate:LIT/USDT')).toThrowError('Crypto pairs look like');
  });

  test('accepts a Gate pair whose ticker is not ASCII', () => {
    expect(parseInstrument('crypto:gate:牛来_USDT')).toEqual({
      id: 'crypto:gate:牛来USDT',
      market: 'crypto',
      code: '牛来USDT',
      source: 'gate',
    });
  });

  test('accepts the punctuation Gate uses in ticker codes', () => {
    expect(parseInstrument('crypto:gate:kfc!3_usdt').code).toBe('KFC!3USDT');
    expect(parseInstrument('crypto:gate:skm-cdy_usdt').code).toBe('SKM-CDYUSDT');
  });

  test('rejects a crypto pair that keeps a separator or a slash', () => {
    expect(() => parseInstrument('crypto:gate:BTC:USDT')).toThrowError('Crypto pairs look like');
    expect(() => parseInstrument('crypto:gate:BTC\\USDT')).toThrowError('Crypto pairs look like');
  });

  test('strips whitespace inside a pair, the way the other markets do', () => {
    expect(parseInstrument('crypto:gate:牛来 USDT').code).toBe('牛来USDT');
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
  test('keeps the same ticker from two sources as two instruments', () => {
    const result = parseWatchlist(['crypto:LITUSDT', 'crypto:gate:LIT_USDT']);

    expect(result.instruments.map((instrument) => instrument.id)).toEqual([
      'crypto:LITUSDT',
      'crypto:gate:LITUSDT',
    ]);
    expect(result.invalid).toEqual([]);
  });

  test('treats the two spellings of a Gate pair as one entry', () => {
    const result = parseWatchlist(['crypto:gate:LITUSDT', 'crypto:gate:LIT_USDT']);

    expect(result.instruments.map((instrument) => instrument.id)).toEqual(['crypto:gate:LITUSDT']);
  });

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
  test('compacts a Gate pair into the Binance spelling', () => {
    expect(compactCryptoPair('LIT_USDT')).toBe('LITUSDT');
    expect(compactCryptoPair('牛来_USDT')).toBe('牛来USDT');
    expect(compactCryptoPair('BTCUSDT')).toBe('BTCUSDT');
  });

  test('leaves a pair whose base has an underscore alone', () => {
    expect(compactCryptoPair('LITE_OLD_USDT')).toBe('LITE_OLD_USDT');
    expect(compactCryptoPair('HOLDSTATION_OLD1_USDT')).toBe('HOLDSTATION_OLD1_USDT');
  });

  test('leaves a pair with an unknown quote asset alone', () => {
    expect(compactCryptoPair('FOO_DAI')).toBe('FOO_DAI');
  });

  test('splits a crypto pair into its base and quote asset', () => {
    expect(splitCryptoPair('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(splitCryptoPair('ETHBTC')).toEqual({ base: 'ETH', quote: 'BTC' });
    expect(splitCryptoPair('LIT_USDT')).toEqual({ base: 'LIT', quote: 'USDT' });
  });

  test('refuses to split a pair without a known quote asset', () => {
    expect(splitCryptoPair('NOPE')).toBeUndefined();
    expect(splitCryptoPair('LIT_NOPE')).toBeUndefined();
  });

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
