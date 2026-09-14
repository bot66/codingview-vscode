import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createSinaProvider, parseSinaResponse } from '../providers/sina';
import type { HttpGetInit, Instrument } from '../providers/types';
import { parseInstrument } from '../symbols';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function symbolMap(entries: Array<[string, Instrument]>): Map<string, Instrument> {
  return new Map(entries);
}

describe('parseSinaResponse', () => {
  test('parses an A-share quote and derives the change', () => {
    const maotai = parseInstrument('cn:600519');

    const quotes = parseSinaResponse(fixture('sina-quotes.txt'), symbolMap([['sh600519', maotai]]));

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      id: 'cn:600519',
      name: '贵州茅台',
      price: 1277.96,
      prevClose: 1275.16,
      currency: 'CNY',
      asOf: '2026-09-14 15:34:59',
      source: 'sina',
    });
    expect(quotes[0].change).toBeCloseTo(2.8, 3);
    expect(quotes[0].changePercent).toBeCloseTo(0.22, 2);
  });

  test('parses a US quote using the gb_ field layout', () => {
    const apple = parseInstrument('us:AAPL');

    const quotes = parseSinaResponse(fixture('sina-quotes.txt'), symbolMap([['gb_aapl', apple]]));

    expect(quotes).toEqual([
      {
        id: 'us:AAPL',
        market: 'us',
        code: 'AAPL',
        name: '苹果',
        price: 333.33,
        prevClose: 332.27,
        change: 1.06,
        changePercent: 0.32,
        currency: 'USD',
        asOf: '2026-09-14 22:33:36',
        source: 'sina',
      },
    ]);
  });

  test('ignores empty payloads', () => {
    const index = parseInstrument('cn:399001');

    const quotes = parseSinaResponse(fixture('sina-quotes.txt'), symbolMap([['sz399001', index]]));

    expect(quotes).toEqual([]);
  });

  test('parses a Hong Kong quote in HKD', () => {
    const tencent = parseInstrument('hk:700');

    const quotes = parseSinaResponse(fixture('sina-hk.txt'), symbolMap([['rt_hk00700', tencent]]));

    expect(quotes).toEqual([
      {
        id: 'hk:00700',
        market: 'hk',
        code: '00700',
        name: '腾讯控股',
        price: 430.6,
        prevClose: 428.4,
        change: 2.2,
        changePercent: 0.514,
        currency: 'HKD',
        asOf: '2026/09/14 16:08:08',
        source: 'sina',
      },
    ]);
  });
});

describe('createSinaProvider', () => {
  test('sends the Referer header the endpoint requires', async () => {
    const requests: Array<{ url: string; init?: HttpGetInit }> = [];
    const provider = createSinaProvider({
      httpGet: async (url, init) => {
        requests.push({ url, init });
        return new TextEncoder().encode(fixture('sina-quotes.txt'));
      },
    });

    await provider.fetch([parseInstrument('cn:600519'), parseInstrument('us:AAPL')]);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://hq.sinajs.cn/list=sh600519,gb_aapl');
    expect(requests[0].init?.headers).toEqual({ Referer: 'https://finance.sina.com.cn/' });
  });

  test('requests Hong Kong symbols with the rt_hk prefix', async () => {
    const requests: string[] = [];
    const provider = createSinaProvider({
      httpGet: async (url) => {
        requests.push(url);
        return new TextEncoder().encode(fixture('sina-hk.txt'));
      },
    });

    const quotes = await provider.fetch([parseInstrument('hk:700')]);

    expect(requests).toEqual(['https://hq.sinajs.cn/list=rt_hk00700']);
    expect(quotes[0]).toMatchObject({ id: 'hk:00700', price: 430.6 });
  });
});
