import type { Instrument, Quote, QuoteProvider } from './providers/types';

export const MAX_BATCH = 50;
export const DEFAULT_TIMEOUT_MS = 8000;

const BACKOFF_SECONDS = [60, 120, 240, 300];

/** 60s after the first failure, doubling up to a 5 minute cap. */
export function backoffSeconds(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return BACKOFF_SECONDS[0];
  }
  const index = Math.min(consecutiveFailures - 1, BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[index];
}

export interface RefreshOutcome {
  quotes: Quote[];
  /** Instruments no provider could resolve, for example unknown codes. */
  missing: string[];
  providerErrors: string[];
}

export interface QuoteServiceOptions {
  providers: QuoteProvider[];
  timeoutMs?: number;
  /** `auto` walks every provider in order, otherwise only the matching provider id is used. */
  providerMode?: string;
}

export class QuoteService {
  private readonly providers: QuoteProvider[];
  private readonly timeoutMs: number;
  private readonly providerMode: string;

  constructor(options: QuoteServiceOptions) {
    this.providers = options.providers;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.providerMode = options.providerMode ?? 'auto';
  }

  async refresh(instruments: readonly Instrument[]): Promise<RefreshOutcome> {
    const quotes: Quote[] = [];
    const providerErrors: string[] = [];
    const pending = new Map(instruments.map((instrument) => [instrument.id, instrument]));

    for (const provider of this.candidates()) {
      const batch = [...pending.values()].filter((instrument) => provider.supports(instrument.market));
      if (batch.length === 0) {
        continue;
      }
      try {
        for (const quote of await this.fetchBatched(provider, batch)) {
          quotes.push(quote);
          pending.delete(quote.id);
        }
      } catch (error) {
        providerErrors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { quotes, missing: [...pending.keys()], providerErrors };
  }

  private candidates(): QuoteProvider[] {
    if (this.providerMode === 'auto') {
      return this.providers;
    }
    const selected = this.providers.filter((provider) => provider.id === this.providerMode);
    return selected.length > 0 ? selected : this.providers;
  }

  private async fetchBatched(provider: QuoteProvider, instruments: Instrument[]): Promise<Quote[]> {
    const collected: Quote[] = [];
    for (let offset = 0; offset < instruments.length; offset += MAX_BATCH) {
      const chunk = instruments.slice(offset, offset + MAX_BATCH);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        collected.push(...(await provider.fetch(chunk, controller.signal)));
      } finally {
        clearTimeout(timer);
      }
    }
    return collected;
  }
}
