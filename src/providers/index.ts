import { createBinanceVisionProvider } from './binanceVision';
import { createFinnhubProvider } from './finnhub';
import { GateCatalog, createGateProvider } from './gate';
import { createSinaProvider } from './sina';
import { createTencentProvider } from './tencent';
import type { QuoteProvider } from './types';

export interface DefaultProviderOptions {
  /** Finnhub key lookup. Without a key the provider stays inert and US quotes fall back. */
  finnhubApiKey?: () => string | undefined;
  /** Shared Gate metadata cache, so the search command and the provider reuse one session. */
  gateCatalog?: GateCatalog;
}

/**
 * Ordered by preference. Finnhub leads only when a key is configured, stocks fall back from
 * Tencent to Sina, and crypto tries Binance Vision before Gate, which also prices the pairs
 * explicitly pinned with `crypto:gate:<PAIR>`.
 */
export function createDefaultProviders(options: DefaultProviderOptions = {}): QuoteProvider[] {
  return [
    createFinnhubProvider({ getApiKey: options.finnhubApiKey ?? (() => undefined) }),
    createTencentProvider(),
    createSinaProvider(),
    createBinanceVisionProvider(),
    createGateProvider({ catalog: options.gateCatalog }),
  ];
}

export { GateCatalog } from './gate';
export type { CryptoSource, Instrument, Market, Quote, QuoteProvider } from './types';
