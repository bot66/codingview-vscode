import { HttpError } from './http';
import { defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';
import { ProviderError } from './types';

export const FINNHUB_ENDPOINT = 'https://finnhub.io/api/v1/quote';
/** Finnhub takes the token in a header, so it never ends up in a URL, a log line or an error. */
export const FINNHUB_TOKEN_HEADER = 'X-Finnhub-Token';

interface FinnhubQuotePayload {
  c?: number;
  d?: number;
  dp?: number;
  pc?: number;
  t?: number;
  error?: string;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Finnhub reports `t` in seconds since the epoch, and 0 when it has no timestamp. */
function asOfFromUnix(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export function parseFinnhubQuote(text: string, instrument: Instrument): Quote | undefined {
  const payload: unknown = JSON.parse(text);
  if (typeof payload !== 'object' || payload === null) {
    throw new ProviderError('Unexpected Finnhub response.', 'finnhub');
  }

  const record = payload as FinnhubQuotePayload;
  if (typeof record.error === 'string') {
    throw new ProviderError(record.error, 'finnhub');
  }

  const price = toNumber(record.c);
  if (price === undefined || price <= 0) {
    return undefined;
  }

  return {
    id: instrument.id,
    market: instrument.market,
    code: instrument.code,
    price,
    prevClose: toNumber(record.pc),
    change: toNumber(record.d),
    changePercent: toNumber(record.dp),
    currency: 'USD',
    asOf: asOfFromUnix(toNumber(record.t)),
    source: 'finnhub',
  };
}

export interface FinnhubProviderOptions {
  /** Synchronous lookup into the cached `SecretStorage` value; undefined disables the provider. */
  getApiKey: () => string | undefined;
  httpGet?: HttpGetBytes;
}

/**
 * Keyed US source. Finnhub has no batch quote endpoint, so the provider issues one request per
 * symbol; the free tier allows 60 requests per minute, which a 50 symbol watchlist cycle fits.
 */
export function createFinnhubProvider(options: FinnhubProviderOptions): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;

  return {
    id: 'finnhub',
    displayName: 'Finnhub',
    supports: (market) => market === 'us' && Boolean(options.getApiKey()),
    fetch: async (instruments, signal) => {
      const apiKey = options.getApiKey();
      if (!apiKey) {
        throw new ProviderError('No Finnhub API key is stored. Run "CodingView: Set API Key".', 'finnhub');
      }

      const quotes: Quote[] = [];
      for (const instrument of instruments) {
        if (instrument.market !== 'us') {
          continue;
        }
        const url = `${FINNHUB_ENDPOINT}?symbol=${encodeURIComponent(instrument.code)}`;
        let bytes: Uint8Array;
        try {
          bytes = await httpGet(url, { headers: { [FINNHUB_TOKEN_HEADER]: apiKey }, signal });
        } catch (error) {
          throw explainHttpError(error);
        }
        const quote = parseFinnhubQuote(new TextDecoder().decode(bytes), instrument);
        if (quote) {
          quotes.push(quote);
        }
      }
      return quotes;
    },
  };
}

function explainHttpError(error: unknown): Error {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    return new ProviderError(
      'Finnhub rejected the stored API key. Run "CodingView: Set API Key" to replace it.',
      'finnhub',
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
