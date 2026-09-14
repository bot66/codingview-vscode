import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createTencentProvider, parseTencentResponse } from '../providers/tencent';
import type { Instrument } from '../providers/types';
import { parseInstrument } from '../symbols';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function symbolMap(entries: Array<[string, Instrument]>): Map<string, Instrument> {
  return new Map(entries);
}

describe('parseTencentResponse', () => {
  test('parses an A-share quote', () => {
    const maotai = parseInstrument('cn:600519');

    const quotes = parseTencentResponse(fixture('tencent-quotes.txt'), symbolMap([['sh600519', maotai]]));

    expect(quotes).toEqual([
      {
        id: 'cn:600519',
        market: 'cn',
        code: '600519',
        name: '贵州茅台',
        price: 1277.96,
        prevClose: 1275.16,
        change: 2.8,
        changePercent: 0.22,
        currency: 'CNY',
        asOf: '20260914161450',
        source: 'tencent',
      },
    ]);
  });

  test('parses a US quote with its currency and timestamp', () => {
    const apple = parseInstrument('us:AAPL');

    const quotes = parseTencentResponse(fixture('tencent-quotes.txt'), symbolMap([['usAAPL', apple]]));

    expect(quotes).toEqual([
      {
        id: 'us:AAPL',
        market: 'us',
        code: 'AAPL',
        name: '苹果',
        price: 333.4,
        prevClose: 332.27,
        change: 1.13,
        changePercent: 0.34,
        currency: 'USD',
        asOf: '2026-09-14 10:33:20',
        source: 'tencent',
      },
    ]);
  });

  test('ignores zero priced stub rows that the API returns for unknown codes', () => {
    const unknown = parseInstrument('us:ZZZZZ');

    const quotes = parseTencentResponse(fixture('tencent-invalid.txt'), symbolMap([['usZZZZZ', unknown]]));

    expect(quotes).toEqual([]);
  });
});

describe('createTencentProvider', () => {
  test('fetches every instrument in a single batch request', async () => {
    const urls: string[] = [];
    const provider = createTencentProvider({
      httpGet: async (url) => {
        urls.push(url);
        return new TextEncoder().encode(fixture('tencent-quotes.txt'));
      },
    });

    const quotes = await provider.fetch([parseInstrument('cn:600519'), parseInstrument('us:AAPL')]);

    expect(urls).toEqual(['https://qt.gtimg.cn/q=sh600519,usAAPL']);
    expect(quotes.map((quote) => quote.id)).toEqual(['cn:600519', 'us:AAPL']);
  });

  test('skips markets it does not serve', async () => {
    const urls: string[] = [];
    const provider = createTencentProvider({
      httpGet: async (url) => {
        urls.push(url);
        return new TextEncoder().encode('');
      },
    });

    const quotes = await provider.fetch([parseInstrument('crypto:BTCUSDT')]);

    expect(quotes).toEqual([]);
    expect(urls).toEqual([]);
  });

  test('decodes GBK encoded instrument names', async () => {
    const appleBytes = Uint8Array.from([0xc6, 0xbb, 0xb9, 0xfb]);
    const payload = Uint8Array.from([
      ...new TextEncoder().encode('v_sh600519="1~'),
      ...appleBytes,
      ...new TextEncoder().encode('~600519~3000.00~2990.00~2995.00";'),
    ]);
    const provider = createTencentProvider({ httpGet: async () => payload });

    const quotes = await provider.fetch([parseInstrument('cn:600519')]);

    expect(quotes[0].name).toBe('苹果');
    expect(quotes[0].price).toBe(3000);
  });
});
