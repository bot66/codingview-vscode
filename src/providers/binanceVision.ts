import { splitCryptoPair } from '../symbols';
import { HttpError, defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';
import { ProviderError } from './types';

export const BINANCE_ENDPOINT = 'https://data-api.binance.vision/api/v3/ticker/24hr';

/** Single-symbol retries after a batch error; enough to stay well inside the request timeout. */
const RETRY_CONCURRENCY = 5;

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  prevClosePrice?: string;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `BTCUSDT` and `ETHBTC` are traded in `BTC` and `ETH`; the pair itself stays the code. */
export function baseAsset(pair: string): string {
  return splitCryptoPair(pair)?.base ?? pair;
}

export function parseBinanceVisionResponse(text: string, bySymbol: Map<string, Instrument>): Quote[] {
  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload)) {
    const message =
      typeof payload === 'object' && payload !== null && 'msg' in payload
        ? String((payload as { msg: unknown }).msg)
        : 'Unexpected Binance Vision response.';
    throw new ProviderError(message, 'binance-vision');
  }

  const quotes: Quote[] = [];
  for (const ticker of payload as BinanceTicker[]) {
    const instrument = bySymbol.get(ticker.symbol);
    if (!instrument) {
      continue;
    }
    const price = toNumber(ticker.lastPrice);
    if (price === undefined || price <= 0) {
      continue;
    }
    quotes.push({
      id: instrument.id,
      market: instrument.market,
      code: instrument.code,
      // Crypto pairs have no display name, so the base asset plays that role.
      name: baseAsset(ticker.symbol),
      price,
      prevClose: toNumber(ticker.prevClosePrice),
      change: toNumber(ticker.priceChange),
      changePercent: toNumber(ticker.priceChangePercent),
      currency: splitCryptoPair(ticker.symbol)?.quote,
      source: 'binance-vision',
    });
  }
  return quotes;
}

export interface BinanceVisionProviderOptions {
  httpGet?: HttpGetBytes;
}

/**
 * A batch request fails as a whole when any symbol is unknown, so the provider retries the
 * symbols one by one to keep the known ones priced. Transport failures are not retried.
 */
function isIsolatable(error: unknown): boolean {
  return error instanceof ProviderError || (error instanceof HttpError && error.status === 400);
}

export function createBinanceVisionProvider(options: BinanceVisionProviderOptions = {}): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;

  const request = async (symbols: string[], signal?: AbortSignal): Promise<string> => {
    const query = new URLSearchParams({ symbols: JSON.stringify(symbols) });
    const bytes = await httpGet(`${BINANCE_ENDPOINT}?${query.toString()}`, { signal });
    return new TextDecoder().decode(bytes);
  };

  /** One request per symbol, at most {@link RETRY_CONCURRENCY} in flight, in watchlist order. */
  const requestIndividually = async (
    symbols: string[],
    bySymbol: Map<string, Instrument>,
    signal?: AbortSignal,
  ): Promise<Quote[]> => {
    const resolved = new Map<string, Quote[]>();
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= symbols.length) {
          return;
        }
        const symbol = symbols[index];
        try {
          resolved.set(symbol, parseBinanceVisionResponse(await request([symbol], signal), bySymbol));
        } catch (error) {
          if (!isIsolatable(error)) {
            throw error;
          }
          resolved.set(symbol, []);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(RETRY_CONCURRENCY, symbols.length) }, () => worker()),
    );
    return symbols.flatMap((symbol) => resolved.get(symbol) ?? []);
  };

  return {
    id: 'binance-vision',
    displayName: 'Binance Vision',
    supports: (market) => market === 'crypto',
    handles: (instrument) =>
      instrument.market === 'crypto' && (instrument.source === undefined || instrument.source === 'binance'),
    fetch: async (instruments, signal) => {
      const bySymbol = new Map<string, Instrument>();
      for (const instrument of instruments) {
        if (instrument.market === 'crypto' && (instrument.source === undefined || instrument.source === 'binance')) {
          bySymbol.set(instrument.code, instrument);
        }
      }
      if (bySymbol.size === 0) {
        return [];
      }

      const symbols = [...bySymbol.keys()];
      try {
        return parseBinanceVisionResponse(await request(symbols, signal), bySymbol);
      } catch (error) {
        if (symbols.length === 1 || !isIsolatable(error)) {
          throw error;
        }
        return requestIndividually(symbols, bySymbol, signal);
      }
    },
  };
}
