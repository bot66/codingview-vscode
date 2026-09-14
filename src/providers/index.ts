import { createBinanceVisionProvider } from './binanceVision';
import { createFinnhubProvider } from './finnhub';
import { createSinaProvider } from './sina';
import { createTencentProvider } from './tencent';
import type { QuoteProvider } from './types';

export interface DefaultProviderOptions {
  /** Finnhub key lookup. Without a key the provider stays inert and US quotes fall back. */
  finnhubApiKey?: () => string | undefined;
}

/**
 * Ordered by preference. Finnhub leads only when a key is configured, stocks fall back from
 * Tencent to Sina, and crypto uses Binance Vision.
 */
export function createDefaultProviders(options: DefaultProviderOptions = {}): QuoteProvider[] {
  return [
    createFinnhubProvider({ getApiKey: options.finnhubApiKey ?? (() => undefined) }),
    createTencentProvider(),
    createSinaProvider(),
    createBinanceVisionProvider(),
  ];
}

export type { Instrument, Market, Quote, QuoteProvider } from './types';
