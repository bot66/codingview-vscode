import { rankCryptoMatches, type CryptoCandidate, type GateCurrency, type GateTicker } from '../cryptoSearch';
import { splitCryptoPair } from '../symbols';
import { HttpError, defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';
import { ProviderError } from './types';

export const GATE_TICKERS_ENDPOINT = 'https://api.gateio.ws/api/v4/spot/tickers';
export const GATE_CURRENCIES_ENDPOINT = 'https://api.gateio.ws/api/v4/spot/currencies';

/** The two catalogue lists are ≈2.6 MB together and the search command has no caller timeout. */
export const GATE_CATALOG_TIMEOUT_MS = 15000;

export type GateTickerRow = GateTicker;

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Gate pairs are `<BASE>_<QUOTE>`; `LITE_OLD_USDT` shows why the split takes the last one. */
export function splitGatePair(pair: string): { base: string; quote: string } | undefined {
  const separator = pair.lastIndexOf('_');
  if (separator <= 0 || separator === pair.length - 1) {
    return undefined;
  }
  return { base: pair.slice(0, separator), quote: pair.slice(separator + 1) };
}

/**
 * The Gate pair for a configured code: a code that already carries the separator is used as
 * written, a bare `BTCUSDT` is split on the known quote asset into `BTC_USDT`.
 */
export function gatePairFor(code: string): string | undefined {
  if (code.includes('_')) {
    return splitGatePair(code) ? code : undefined;
  }
  const split = splitCryptoPair(code);
  return split ? `${split.base}_${split.quote}` : undefined;
}

export function parseGateTickers(text: string): GateTickerRow[] {
  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload)) {
    throw new ProviderError('Unexpected Gate ticker response.', 'gate');
  }
  return payload
    .filter((row): row is GateTickerRow => typeof (row as GateTickerRow | undefined)?.currency_pair === 'string')
    .map((row) => ({
      currency_pair: row.currency_pair,
      last: row.last,
      change_percentage: row.change_percentage,
    }));
}

/**
 * Gate reports the change percent but no previous close, so the previous close — and with it the
 * absolute change — is derived from `last / (1 + percent/100)` and rounded like the Sina parser.
 */
export function gateQuote(row: GateTickerRow, instrument: Instrument, name?: string): Quote | undefined {
  const price = toNumber(row.last);
  if (price === undefined || price <= 0) {
    return undefined;
  }
  const changePercent = toNumber(row.change_percentage);
  const factor = changePercent === undefined ? undefined : 1 + changePercent / 100;
  const prevClose = factor !== undefined && factor > 0 ? round(price / factor) : undefined;
  const split = splitGatePair(row.currency_pair);
  return {
    id: instrument.id,
    market: instrument.market,
    code: instrument.code,
    name: name ?? split?.base,
    price,
    prevClose,
    change: prevClose === undefined ? undefined : round(price - prevClose),
    changePercent,
    currency: split?.quote,
    source: 'gate',
  };
}

export interface GateCatalogOptions {
  httpGet?: HttpGetBytes;
}

/**
 * Gate metadata with a session cache: one request per currency for the display name, and the two
 * catalogue lists behind the search command. Owned by `extension.ts` so the provider and the
 * command share the cache.
 */
export class GateCatalog {
  private readonly httpGet: HttpGetBytes;
  private readonly names = new Map<string, string | undefined>();
  private lists?: Promise<{ currencies: GateCurrency[]; tickers: GateTicker[] }>;

  constructor(options: GateCatalogOptions = {}) {
    this.httpGet = options.httpGet ?? defaultHttpGetBytes;
  }

  /** Coin name from `GET /spot/currencies/<CODE>`; `undefined` when Gate has no such currency. */
  async nameFor(currency: string, signal?: AbortSignal): Promise<string | undefined> {
    if (this.names.has(currency)) {
      return this.names.get(currency);
    }
    let name: string | undefined;
    try {
      const payload = await this.fetchJson<{ name?: unknown }>(
        `${GATE_CURRENCIES_ENDPOINT}/${encodeURIComponent(currency)}`,
        signal,
      );
      name = typeof payload?.name === 'string' && payload.name.length > 0 ? payload.name : undefined;
    } catch (error) {
      if (!(error instanceof HttpError && (error.status === 400 || error.status === 404))) {
        throw error;
      }
    }
    this.names.set(currency, name);
    return name;
  }

  /** Coins matching a name or ticker query, most relevant first. */
  async search(query: string, limit?: number, signal?: AbortSignal): Promise<CryptoCandidate[]> {
    const { currencies, tickers } = await this.catalog(signal);
    return rankCryptoMatches(query, currencies, tickers, limit);
  }

  private catalog(signal?: AbortSignal): Promise<{ currencies: GateCurrency[]; tickers: GateTicker[] }> {
    if (!this.lists) {
      this.lists = this.fetchCatalog(signal).catch((error: unknown) => {
        // A failed catalogue must not be cached, or the next search retries a dead promise.
        this.lists = undefined;
        throw error;
      });
    }
    return this.lists;
  }

  private async fetchCatalog(signal?: AbortSignal): Promise<{ currencies: GateCurrency[]; tickers: GateTicker[] }> {
    // The quote path passes the service's signal; a bare search gets its own bound so a stalled
    // connection cannot leave the progress notification spinning forever.
    const controller = signal ? undefined : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), GATE_CATALOG_TIMEOUT_MS) : undefined;
    try {
      const [currencies, tickers] = await Promise.all([
        this.fetchJson<GateCurrency[]>(GATE_CURRENCIES_ENDPOINT, signal ?? controller?.signal),
        this.fetchJson<GateTicker[]>(GATE_TICKERS_ENDPOINT, signal ?? controller?.signal),
      ]);
      return {
        currencies: Array.isArray(currencies) ? currencies : [],
        tickers: Array.isArray(tickers) ? tickers : [],
      };
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private async fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const bytes = await this.httpGet(url, { signal });
    return JSON.parse(decode(bytes)) as T;
  }
}

export interface GateProviderOptions {
  httpGet?: HttpGetBytes;
  catalog?: GateCatalog;
}

export function createGateProvider(options: GateProviderOptions = {}): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;
  const catalog = options.catalog ?? new GateCatalog({ httpGet });

  const handles = (instrument: Instrument): boolean =>
    instrument.market === 'crypto' && (instrument.source === undefined || instrument.source === 'gate');

  const fetchOne = async (
    instrument: Instrument,
    pair: string,
    signal?: AbortSignal,
  ): Promise<Quote | undefined> => {
    const bytes = await httpGet(`${GATE_TICKERS_ENDPOINT}?currency_pair=${encodeURIComponent(pair)}`, { signal });
    const [row] = parseGateTickers(decode(bytes));
    if (!row || row.currency_pair !== pair) {
      return undefined;
    }
    const base = splitGatePair(pair)?.base ?? instrument.code;
    // A missing name only costs the label, so it never fails the batch.
    const name = await catalog.nameFor(base, signal).catch(() => undefined);
    return gateQuote(row, instrument, name);
  };

  return {
    id: 'gate',
    displayName: 'Gate.io',
    supports: (market) => market === 'crypto',
    handles,
    fetch: async (instruments, signal) => {
      const targets = instruments
        .filter(handles)
        .map((instrument) => ({ instrument, pair: gatePairFor(instrument.code) }))
        .filter((target): target is { instrument: Instrument; pair: string } => target.pair !== undefined);
      if (targets.length === 0) {
        return [];
      }

      const settled = await Promise.allSettled(
        targets.map(({ instrument, pair }) => fetchOne(instrument, pair, signal)),
      );
      const quotes: Quote[] = [];
      for (const result of settled) {
        if (result.status === 'rejected') {
          const error: unknown = result.reason;
          // An unknown pair answers 400; that instrument simply stays unresolved.
          if (error instanceof HttpError && (error.status === 400 || error.status === 404)) {
            continue;
          }
          throw error;
        }
        if (result.value) {
          quotes.push(result.value);
        }
      }
      return quotes;
    },
  };
}
