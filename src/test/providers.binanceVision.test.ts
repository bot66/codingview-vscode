import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createBinanceVisionProvider, parseBinanceVisionResponse } from '../providers/binanceVision';
import type { Instrument } from '../providers/types';
import { parseInstrument } from '../symbols';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function symbolMap(entries: Array<[string, Instrument]>): Map<string, Instrument> {
  return new Map(entries);
}

describe('parseBinanceVisionResponse', () => {
  test('parses a batch of crypto tickers', () => {
    const bitcoin = parseInstrument('crypto:BTCUSDT');
    const ether = parseInstrument('crypto:ETHUSDT');

    const quotes = parseBinanceVisionResponse(
      fixture('binance-ticker-24hr.json'),
      symbolMap([
        ['BTCUSDT', bitcoin],
        ['ETHUSDT', ether],
      ]),
    );

    expect(quotes).toEqual([
      {
        id: 'crypto:BTCUSDT',
        market: 'crypto',
        code: 'BTCUSDT',
        price: 78372.01,
        prevClose: 77202.76,
        change: 1169.25,
        changePercent: 1.515,
        currency: 'USDT',
        source: 'binance-vision',
      },
      {
        id: 'crypto:ETHUSDT',
        market: 'crypto',
        code: 'ETHUSDT',
        price: 2498.78,
        prevClose: 2493.35,
        change: 5.43,
        changePercent: 0.218,
        currency: 'USDT',
        source: 'binance-vision',
      },
    ]);
  });

  test('turns an API error payload into a provider error', () => {
    expect(() =>
      parseBinanceVisionResponse('{"code":-1121,"msg":"Invalid symbol."}', symbolMap([])),
    ).toThrowError('Invalid symbol.');
  });

  test('ignores tickers without a usable price', () => {
    const quotes = parseBinanceVisionResponse(
      '[{"symbol":"BTCUSDT","lastPrice":"0.00000000","priceChange":"0.00","priceChangePercent":"0.000"}]',
      symbolMap([['BTCUSDT', parseInstrument('crypto:BTCUSDT')]]),
    );

    expect(quotes).toEqual([]);
  });
});

describe('createBinanceVisionProvider', () => {
  test('requests the watchlist as a JSON array of symbols', async () => {
    const urls: string[] = [];
    const provider = createBinanceVisionProvider({
      httpGet: async (url) => {
        urls.push(url);
        return new TextEncoder().encode(fixture('binance-ticker-24hr.json'));
      },
    });

    await provider.fetch([parseInstrument('crypto:BTCUSDT'), parseInstrument('crypto:ETHUSDT')]);

    expect(urls).toEqual([
      'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D',
    ]);
  });
});
