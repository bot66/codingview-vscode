import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  GATE_CATALOG_TIMEOUT_MS,
  GateCatalog,
  createGateProvider,
  gateQuote,
  parseGateTickers,
} from '../providers/gate';
import { HttpError } from '../providers/http';
import type { HttpGetBytes } from '../providers/types';
import { parseInstrument } from '../symbols';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

const encoder = new TextEncoder();

/** Records every request and answers from a table keyed by the part after `/api/v4/spot/`. */
function stubHttp(routes: Record<string, string>, log: string[] = []): { urls: string[]; httpGet: HttpGetBytes } {
  const urls: string[] = log;
  return {
    urls,
    httpGet: async (url) => {
      urls.push(url);
      const key = url.split('/api/v4/spot/')[1];
      const body = routes[key];
      if (body === undefined) {
        throw new HttpError(400, url);
      }
      return encoder.encode(body);
    },
  };
}

const LIT_ROUTES = {
  'tickers?currency_pair=LIT_USDT': fixture('gate-ticker-lit.json'),
  'currencies/LIT': fixture('gate-currency-lit.json'),
};

afterEach(() => {
  vi.useRealTimers();
});

describe('parseGateTickers', () => {
  test('reads the price and the change percent of one pair', () => {
    expect(parseGateTickers(fixture('gate-ticker-lit.json'))).toEqual([
      { currency_pair: 'LIT_USDT', last: '4.234', change_percentage: '-3.11' },
    ]);
  });
});

describe('gateQuote', () => {
  test('turns a ticker into a quote with the currency name', () => {
    const instrument = parseInstrument('crypto:gate:LIT_USDT');
    const [ticker] = parseGateTickers(fixture('gate-ticker-lit.json'));

    expect(gateQuote(ticker, instrument, 'Lighter')).toEqual({
      id: 'crypto:gate:LITUSDT',
      market: 'crypto',
      code: 'LITUSDT',
      name: 'Lighter',
      price: 4.234,
      prevClose: 4.3699,
      change: -0.1359,
      changePercent: -3.11,
      currency: 'USDT',
      source: 'gate',
    });
  });

  test('drops a pair without a usable price', () => {
    const instrument = parseInstrument('crypto:gate:LIT_USDT');

    expect(gateQuote({ currency_pair: 'LIT_USDT', last: '0' }, instrument)).toBeUndefined();
  });
});

describe('createGateProvider', () => {
  test('asks Gate for the pair and the currency name', async () => {
    const { urls, httpGet } = stubHttp(LIT_ROUTES);
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    const quotes = await provider.fetch([parseInstrument('crypto:gate:LIT_USDT')]);

    expect(quotes).toEqual([
      expect.objectContaining({ id: 'crypto:gate:LITUSDT', name: 'Lighter', price: 4.234, source: 'gate' }),
    ]);
    expect(urls).toEqual([
      'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=LIT_USDT',
      'https://api.gateio.ws/api/v4/spot/currencies/LIT',
    ]);
  });

  test('rewrites a bare pair into the Gate separator', async () => {
    const { urls, httpGet } = stubHttp(LIT_ROUTES);
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    const quotes = await provider.fetch([parseInstrument('crypto:LITUSDT')]);

    expect(urls[0]).toContain('currency_pair=LIT_USDT');
    expect(quotes.map((quote) => quote.id)).toEqual(['crypto:LITUSDT']);
  });

  test('asks Gate with the separator even though the symbol has none', async () => {
    const { urls, httpGet } = stubHttp(LIT_ROUTES);
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    await provider.fetch([parseInstrument('crypto:gate:LITUSDT')]);

    expect(urls[0]).toBe('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=LIT_USDT');
  });

  test('sends a pair whose base has an underscore as written', async () => {
    const { urls, httpGet } = stubHttp({});
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    await provider.fetch([parseInstrument('crypto:gate:LITE_OLD_USDT')]);

    expect(urls[0]).toBe('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=LITE_OLD_USDT');
  });

  test('treats an unknown pair as unresolved instead of failing the batch', async () => {
    const { httpGet } = stubHttp({});
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    const quotes = await provider.fetch([parseInstrument('crypto:gate:NOPE_USDT')]);

    expect(quotes).toEqual([]);
  });

  test('looks a currency name up once per session', async () => {
    const { urls, httpGet } = stubHttp(LIT_ROUTES);
    const catalog = new GateCatalog({ httpGet });
    const provider = createGateProvider({ httpGet, catalog });
    const instrument = parseInstrument('crypto:gate:LIT_USDT');

    await provider.fetch([instrument]);
    await provider.fetch([instrument]);

    expect(urls.filter((url) => url.includes('/currencies/'))).toHaveLength(1);
  });

  test('skips a pair that is qualified for another source', async () => {
    const { urls, httpGet } = stubHttp(LIT_ROUTES);
    const provider = createGateProvider({ httpGet, catalog: new GateCatalog({ httpGet }) });

    const quotes = await provider.fetch([parseInstrument('crypto:binance:BTCUSDT')]);

    expect(quotes).toEqual([]);
    expect(urls).toEqual([]);
  });

  test('handles crypto pairs the user did not pin to a source', () => {
    const provider = createGateProvider({ httpGet: stubHttp({}).httpGet });

    expect(provider.handles?.(parseInstrument('crypto:BTCUSDT'))).toBe(true);
    expect(provider.handles?.(parseInstrument('crypto:gate:LIT_USDT'))).toBe(true);
    expect(provider.handles?.(parseInstrument('crypto:binance:BTCUSDT'))).toBe(false);
    expect(provider.handles?.(parseInstrument('cn:600519'))).toBe(false);
  });
});

describe('GateCatalog.search', () => {
  test('finds a coin by name with its contract and its USDT price', async () => {
    const { urls, httpGet } = stubHttp({
      currencies: fixture('gate-catalog-currencies.json'),
      tickers: fixture('gate-catalog-tickers.json'),
    });
    const catalog = new GateCatalog({ httpGet });

    const matches = await catalog.search('lighter');

    expect(matches).toEqual([
      {
        currency: 'LIT',
        name: 'Lighter',
        pair: 'LIT_USDT',
        price: 4.234,
        changePercent: -3.11,
        chain: 'ETH',
        address: '0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2',
      },
    ]);
    expect(urls).toHaveLength(2);
  });

  test('fetches the catalog once and reuses it', async () => {
    const { urls, httpGet } = stubHttp({
      currencies: fixture('gate-catalog-currencies.json'),
      tickers: fixture('gate-catalog-tickers.json'),
    });
    const catalog = new GateCatalog({ httpGet });

    await catalog.search('lighter');
    await catalog.search('bitcoin');

    expect(urls).toHaveLength(2);
  });

  test('retries the catalog after a failed fetch', async () => {
    const log: string[] = [];
    let fail = true;
    const httpGet: HttpGetBytes = async (url) => {
      log.push(url);
      if (fail) {
        fail = false;
        throw new HttpError(500, url);
      }
      return encoder.encode(
        url.includes('/currencies') ? fixture('gate-catalog-currencies.json') : fixture('gate-catalog-tickers.json'),
      );
    };
    const catalog = new GateCatalog({ httpGet });

    await expect(catalog.search('lighter')).rejects.toThrowError('HTTP 500');
    expect(await catalog.search('lighter')).toHaveLength(1);
  });

  test('gives up on a catalogue request that hangs', async () => {
    vi.useFakeTimers();
    const catalog = new GateCatalog({
      httpGet: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    // The handler is attached before the clock moves, so the abort is never an unhandled rejection.
    const pending = expect(catalog.search('lighter')).rejects.toThrowError('aborted');
    await vi.advanceTimersByTimeAsync(GATE_CATALOG_TIMEOUT_MS);

    await pending;
  });
});
