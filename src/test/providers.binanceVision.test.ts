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
        name: 'BTC',
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
        name: 'ETH',
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

  test('names the base asset of the pair', () => {
    const pairs = ['ETHBTC', 'BTCEUR', 'SOLBNB', 'BTCFDUSD'];
    const payload = JSON.stringify(
      pairs.map((symbol) => ({ symbol, lastPrice: '2.0', priceChange: '0.1', priceChangePercent: '0.5' })),
    );

    const quotes = parseBinanceVisionResponse(
      payload,
      symbolMap(pairs.map((symbol) => [symbol, parseInstrument(`crypto:${symbol}`)])),
    );

    expect(quotes.map((quote) => [quote.code, quote.name])).toEqual([
      ['ETHBTC', 'ETH'],
      ['BTCEUR', 'BTC'],
      ['SOLBNB', 'SOL'],
      ['BTCFDUSD', 'BTC'],
    ]);
  });
});

describe('createBinanceVisionProvider', () => {
  test('skips a pair that is qualified for another source', async () => {
    const urls: string[] = [];
    const provider = createBinanceVisionProvider({
      httpGet: async (url) => {
        urls.push(url);
        return new TextEncoder().encode(fixture('binance-ticker-24hr.json'));
      },
    });

    const quotes = await provider.fetch([parseInstrument('crypto:gate:LIT_USDT')]);

    expect(quotes).toEqual([]);
    expect(urls).toEqual([]);
  });

  test('isolates an unknown symbol instead of failing the whole batch', async () => {
    const requests: string[] = [];
    const provider = createBinanceVisionProvider({
      httpGet: async (url) => {
        const decoded = decodeURIComponent(url);
        requests.push(decoded);
        if (decoded.includes('"BTCUSDT"') && !decoded.includes('NOPEUSDT')) {
          return new TextEncoder().encode(
            '[{"symbol":"BTCUSDT","lastPrice":"78372.01","priceChange":"1169.25","priceChangePercent":"1.515","prevClosePrice":"77202.76"}]',
          );
        }
        return new TextEncoder().encode('{"code":-1121,"msg":"Invalid symbol."}');
      },
    });

    const quotes = await provider.fetch([
      parseInstrument('crypto:BTCUSDT'),
      parseInstrument('crypto:NOPEUSDT'),
    ]);

    expect(quotes.map((quote) => quote.id)).toEqual(['crypto:BTCUSDT']);
    expect(requests[0]).toContain('["BTCUSDT","NOPEUSDT"]');
    expect(requests.slice(1)).toEqual(['["BTCUSDT"]', '["NOPEUSDT"]'].map((symbols) => expect.stringContaining(symbols)));
  });

  test('rethrows a transport failure instead of retrying every symbol', async () => {
    let calls = 0;
    const provider = createBinanceVisionProvider({
      httpGet: async () => {
        calls += 1;
        throw new Error('socket hang up');
      },
    });

    await expect(
      provider.fetch([parseInstrument('crypto:BTCUSDT'), parseInstrument('crypto:ETHUSDT')]),
    ).rejects.toThrowError('socket hang up');
    expect(calls).toBe(1);
  });

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
