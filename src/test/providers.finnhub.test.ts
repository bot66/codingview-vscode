import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { createFinnhubProvider, parseFinnhubQuote } from '../providers/finnhub';
import { HttpError } from '../providers/http';
import type { HttpGetInit } from '../providers/types';
import { parseInstrument } from '../symbols';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('parseFinnhubQuote', () => {
  test('parses a US quote in USD', () => {
    expect(parseFinnhubQuote(fixture('finnhub-quote.json'), parseInstrument('us:AAPL'))).toEqual({
      id: 'us:AAPL',
      market: 'us',
      code: 'AAPL',
      price: 261.74,
      prevClose: 259.5,
      change: 2.24,
      changePercent: 0.8652,
      currency: 'USD',
      asOf: '2025-09-14 11:00:00',
      source: 'finnhub',
    });
  });

  test('returns nothing for a symbol Finnhub cannot price', () => {
    const payload = '{"c":0,"d":0,"dp":0,"h":0,"l":0,"o":0,"pc":0,"t":0}';

    expect(parseFinnhubQuote(payload, parseInstrument('us:ZZZZZ'))).toBeUndefined();
  });

  test('maps an error payload to a provider error', () => {
    expect(() => parseFinnhubQuote(fixture('finnhub-error.json'), parseInstrument('us:AAPL'))).toThrowError(
      'Invalid API key.',
    );
  });
});

describe('createFinnhubProvider', () => {
  test('does not claim US symbols while no key is configured', () => {
    const provider = createFinnhubProvider({ getApiKey: () => undefined });

    expect(provider.supports('us')).toBe(false);
    expect(provider.supports('cn')).toBe(false);
  });

  test('claims US symbols once a key is configured', () => {
    const provider = createFinnhubProvider({ getApiKey: () => 'demo' });

    expect(provider.supports('us')).toBe(true);
    expect(provider.supports('hk')).toBe(false);
  });

  test('asks for a key when fetch is called without one', async () => {
    const provider = createFinnhubProvider({ getApiKey: () => undefined });

    await expect(provider.fetch([parseInstrument('us:AAPL')])).rejects.toThrowError('CodingView: Set API Key');
  });

  test('sends one request per symbol with the key in a header', async () => {
    const requests: Array<{ url: string; init?: HttpGetInit }> = [];
    const provider = createFinnhubProvider({
      getApiKey: () => 'demo',
      httpGet: async (url, init) => {
        requests.push({ url, init });
        return new TextEncoder().encode(fixture('finnhub-quote.json'));
      },
    });

    const quotes = await provider.fetch([parseInstrument('us:AAPL'), parseInstrument('us:msft')]);

    expect(requests.map((request) => request.url)).toEqual([
      'https://finnhub.io/api/v1/quote?symbol=AAPL',
      'https://finnhub.io/api/v1/quote?symbol=MSFT',
    ]);
    expect(requests[0].init?.headers).toEqual({ 'X-Finnhub-Token': 'demo' });
    expect(quotes.map((quote) => quote.id)).toEqual(['us:AAPL', 'us:MSFT']);
  });

  test('explains a rejected key instead of leaking the request', async () => {
    const provider = createFinnhubProvider({
      getApiKey: () => 'wrong',
      httpGet: async (url) => {
        throw new HttpError(401, url);
      },
    });

    await expect(provider.fetch([parseInstrument('us:AAPL')])).rejects.toThrowError(/API key/);
  });
});
