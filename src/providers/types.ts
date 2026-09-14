export type Market = 'cn' | 'hk' | 'us' | 'crypto';

export interface Instrument {
  /** Canonical identifier, for example `cn:600519`. */
  id: string;
  market: Market;
  /** Bare code as configured by the user, for example `600519`, `AAPL` or `BTCUSDT`. */
  code: string;
}

export interface Quote {
  id: string;
  market: Market;
  code: string;
  price: number;
  name?: string;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  asOf?: string;
  source: string;
}

export interface HttpGetInit {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type HttpGetBytes = (url: string, init?: HttpGetInit) => Promise<Uint8Array>;

export interface QuoteProvider {
  id: string;
  displayName: string;
  supports(market: Market): boolean;
  /** Returns one quote per resolvable instrument and omits the rest. */
  fetch(instruments: Instrument[], signal?: AbortSignal): Promise<Quote[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
