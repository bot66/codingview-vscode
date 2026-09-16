/**
 * Matching for the "Search Crypto" command: the pure part that turns Gate's currency catalogue
 * and ticker snapshot into ranked candidates. Kept free of HTTP and `vscode` so it stays unit
 * testable; `src/providers/gate.ts` owns the requests and the cache.
 */

export interface GateCurrency {
  currency: string;
  name?: string;
  delisted?: boolean;
  trade_disabled?: boolean;
  chains?: ReadonlyArray<{ name?: string; addr?: string }>;
}

export interface GateTicker {
  currency_pair: string;
  last?: string;
  change_percentage?: string;
}

export interface CryptoCandidate {
  /** Gate currency code, for example `LIT`. */
  currency: string;
  /** Coin name, for example `Lighter`; falls back to the code when Gate has none. */
  name: string;
  /** Gate trading pair, for example `LIT_USDT`. */
  pair: string;
  price: number;
  changePercent?: number;
  /** Chain and contract of the coin, when Gate publishes a usable address. */
  chain?: string;
  address?: string;
}

export const CRYPTO_SEARCH_LIMIT = 25;

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Gate pads unsupported chains with placeholder addresses such as `invalid-LIT3L-…`. */
function contractOf(currency: GateCurrency): { chain?: string; address?: string } {
  for (const chain of currency.chains ?? []) {
    const address = chain.addr?.trim();
    if (address && address.length > 0 && !address.startsWith('invalid-')) {
      return { chain: chain.name, address };
    }
  }
  return {};
}

/** Exact ticker beats ticker prefix beats name prefix beats a name substring. */
function scoreOf(query: string, currency: string, name: string): number | undefined {
  const ticker = currency.toUpperCase();
  const upperName = name.toUpperCase();
  if (ticker === query) {
    return 0;
  }
  if (ticker.startsWith(query)) {
    return 1;
  }
  if (upperName.startsWith(query)) {
    return 2;
  }
  return upperName.includes(query) ? 3 : undefined;
}

/**
 * Candidates for one query, most relevant first: only coins with a live `<CODE>_USDT` market and
 * neither delisted nor trade-disabled, because those are the ones the watchlist can price.
 */
export function rankCryptoMatches(
  query: string,
  currencies: readonly GateCurrency[],
  tickers: readonly GateTicker[],
  limit = CRYPTO_SEARCH_LIMIT,
): CryptoCandidate[] {
  const needle = query.trim().toUpperCase();
  if (needle.length === 0) {
    return [];
  }

  const byPair = new Map(tickers.map((ticker) => [ticker.currency_pair, ticker]));
  const matches: Array<{ score: number; candidate: CryptoCandidate }> = [];
  for (const currency of currencies) {
    if (currency.delisted === true || currency.trade_disabled === true) {
      continue;
    }
    const pair = `${currency.currency}_USDT`;
    const ticker = byPair.get(pair);
    const price = toNumber(ticker?.last);
    if (price === undefined || price <= 0) {
      continue;
    }
    const name = currency.name && currency.name.length > 0 ? currency.name : currency.currency;
    const score = scoreOf(needle, currency.currency, name);
    if (score === undefined) {
      continue;
    }
    matches.push({
      score,
      candidate: {
        currency: currency.currency,
        name,
        pair,
        price,
        changePercent: toNumber(ticker?.change_percentage),
        ...contractOf(currency),
      },
    });
  }

  return matches
    .sort((left, right) => left.score - right.score || left.candidate.currency.localeCompare(right.candidate.currency))
    .slice(0, limit)
    .map((match) => match.candidate);
}
