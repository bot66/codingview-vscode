import { createBinanceVisionProvider } from './binanceVision';
import { createSinaProvider } from './sina';
import { createTencentProvider } from './tencent';
import type { QuoteProvider } from './types';

/** Ordered by preference: stocks fall back from Tencent to Sina, crypto uses Binance Vision. */
export function createDefaultProviders(): QuoteProvider[] {
  return [createTencentProvider(), createSinaProvider(), createBinanceVisionProvider()];
}

export type { Instrument, Market, Quote, QuoteProvider } from './types';
