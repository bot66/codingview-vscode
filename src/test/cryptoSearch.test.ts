import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { rankCryptoMatches, type GateCurrency, type GateTicker } from '../cryptoSearch';
import { parseInstrument } from '../symbols';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const CURRENCIES = fixture<GateCurrency[]>('gate-catalog-currencies.json');
const TICKERS = fixture<GateTicker[]>('gate-catalog-tickers.json');

describe('rankCryptoMatches', () => {
  test('ranks an exact ticker, then a ticker prefix, then a name prefix', () => {
    const currencies: GateCurrency[] = [
      { currency: 'AA', name: 'Abacus' },
      { currency: 'ABX', name: 'Abrexo' },
      { currency: 'AB', name: 'Ab' },
    ];
    const tickers: GateTicker[] = ['AA', 'ABX', 'AB'].map((currency) => ({
      currency_pair: `${currency}_USDT`,
      last: '1',
    }));

    expect(rankCryptoMatches('ab', currencies, tickers).map((match) => match.currency)).toEqual(['AB', 'ABX', 'AA']);
  });

  test('puts the exact ticker ahead of a prefix of the same ticker', () => {
    const matches = rankCryptoMatches('lit', CURRENCIES, TICKERS);

    expect(matches.map((match) => match.currency)).toEqual(['LIT', 'LITE3L']);
  });

  test('matches on the coin name and keeps its price', () => {
    const matches = rankCryptoMatches('lighter', CURRENCIES, TICKERS);

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
  });

  test('falls back to the next chain when the first address is empty', () => {
    const matches = rankCryptoMatches('bitcoin', CURRENCIES, TICKERS);

    expect(matches[0]).toEqual(
      expect.objectContaining({ currency: 'BTC', chain: 'BSC', address: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c' }),
    );
  });

  test('omits the contract of an exchange-only coin', () => {
    const matches = rankCryptoMatches('LITE3L', CURRENCIES, TICKERS);

    expect(matches[0].chain).toBeUndefined();
    expect(matches[0].address).toBeUndefined();
  });

  test('drops a coin that has no USDT market', () => {
    const currencies: GateCurrency[] = [{ currency: 'NEW', name: 'Newcoin' }];

    expect(rankCryptoMatches('new', currencies, [])).toEqual([]);
  });

  test('skips a delisted and a trade-disabled coin', () => {
    const currencies: GateCurrency[] = [
      { currency: 'DEAD', name: 'Deadcoin', delisted: true },
      { currency: 'STOP', name: 'Stoppedcoin', trade_disabled: true },
    ];
    const tickers: GateTicker[] = [
      { currency_pair: 'DEAD_USDT', last: '1' },
      { currency_pair: 'STOP_USDT', last: '1' },
    ];

    expect(rankCryptoMatches('dead', currencies, tickers)).toEqual([]);
    expect(rankCryptoMatches('stop', currencies, tickers)).toEqual([]);
  });

  test('caps the candidates at the limit', () => {
    const currencies: GateCurrency[] = ['AAA', 'AAB', 'AAC'].map((currency) => ({ currency, name: currency }));
    const tickers: GateTicker[] = currencies.map(({ currency }) => ({ currency_pair: `${currency}_USDT`, last: '1' }));

    expect(rankCryptoMatches('AA', currencies, tickers, 2).map((match) => match.currency)).toEqual(['AAA', 'AAB']);
  });

  test('ignores a blank query', () => {
    expect(rankCryptoMatches('   ', CURRENCIES, TICKERS)).toEqual([]);
  });

  test('finds a coin whose ticker is Chinese', () => {
    const currencies = [fixture<GateCurrency>('gate-currency-niulai.json')];
    const tickers = fixture<GateTicker[]>('gate-ticker-niulai.json');

    const matches = rankCryptoMatches('牛来', currencies, tickers);

    expect(matches).toEqual([
      {
        currency: '牛来',
        name: '牛来',
        pair: '牛来_USDT',
        price: 0.10654,
        changePercent: -5.23,
        chain: 'BSC',
        address: '0xbeea1d618e533a387d941f58a7d4c9b7bd377777',
      },
    ]);
  });

  test('every candidate can be written as a watchlist symbol', () => {
    const currencies = [fixture<GateCurrency>('gate-currency-niulai.json'), ...CURRENCIES];
    const tickers = [...fixture<GateTicker[]>('gate-ticker-niulai.json'), ...TICKERS];

    for (const query of ['lit', 'bitcoin', '牛来']) {
      for (const match of rankCryptoMatches(query, currencies, tickers)) {
        const id = parseInstrument(`crypto:gate:${match.pair}`).id;
        // The status bar shows the code without Gate's separator, like `BTCUSDT`.
        expect(id).not.toContain('_USDT');
      }
    }
  });
});
