export type Market = 'cn' | 'hk' | 'us' | 'crypto';

/** Crypto providers a pair can be pinned to; unqualified pairs use the failover order. */
export type CryptoSource = 'binance' | 'gate';

export interface Instrument {
  /** Canonical identifier, for example `cn:600519`. */
  id: string;
  market: Market;
  /** Bare code as configured by the user, for example `600519`, `AAPL` or `BTCUSDT`. */
  code: string;
  /**
   * Crypto only: the provider the pair was written for, for example `gate` in
   * `crypto:gate:LIT_USDT`. Absent means "ask the crypto providers in failover order".
   */
  source?: CryptoSource;
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
  /** The instrument resolved but has no current price, for example a suspended share. */
  halted?: boolean;
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
  /**
   * Whether this provider should be asked for one instrument. Defaults to `supports(market)`;
   * a provider that answers `false` never sees the instrument and is not counted as failing
   * when that leaves it with an empty batch.
   */
  handles?(instrument: Instrument): boolean;
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
