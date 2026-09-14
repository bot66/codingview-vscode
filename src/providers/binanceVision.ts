import { defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';
import { ProviderError } from './types';

export const BINANCE_ENDPOINT = 'https://data-api.binance.vision/api/v3/ticker/24hr';

const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY'];

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

function quoteAsset(pair: string): string | undefined {
  return QUOTE_ASSETS.find((asset) => pair.endsWith(asset));
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
      // Crypto pairs have no display name, so the pair itself is the name the tooltip shows.
      name: ticker.symbol,
      price,
      prevClose: toNumber(ticker.prevClosePrice),
      change: toNumber(ticker.priceChange),
      changePercent: toNumber(ticker.priceChangePercent),
      currency: quoteAsset(ticker.symbol),
      source: 'binance-vision',
    });
  }
  return quotes;
}

export interface BinanceVisionProviderOptions {
  httpGet?: HttpGetBytes;
}

export function createBinanceVisionProvider(options: BinanceVisionProviderOptions = {}): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;

  return {
    id: 'binance-vision',
    displayName: 'Binance Vision',
    supports: (market) => market === 'crypto',
    fetch: async (instruments, signal) => {
      const bySymbol = new Map<string, Instrument>();
      for (const instrument of instruments) {
        if (instrument.market === 'crypto') {
          bySymbol.set(instrument.code, instrument);
        }
      }
      if (bySymbol.size === 0) {
        return [];
      }

      const query = new URLSearchParams({ symbols: JSON.stringify([...bySymbol.keys()]) });
      const bytes = await httpGet(`${BINANCE_ENDPOINT}?${query.toString()}`, { signal });
      return parseBinanceVisionResponse(new TextDecoder().decode(bytes), bySymbol);
    },
  };
}
