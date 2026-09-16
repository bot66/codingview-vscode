import type { Instrument, Quote, QuoteProvider } from './providers/types';

export const MAX_BATCH = 50;
export const DEFAULT_TIMEOUT_MS = 8000;
export const PROVIDER_FAILURE_THRESHOLD = 2;
export const PROVIDER_COOLDOWN_CYCLES = 3;

const BACKOFF_SECONDS = [60, 120, 240, 300];

/** 60s after the first failure, doubling up to a 5 minute cap. */
export function backoffSeconds(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return BACKOFF_SECONDS[0];
  }
  const index = Math.min(consecutiveFailures - 1, BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[index];
}

export interface ProviderHealthOptions {
  /** Consecutive failures before a provider is skipped (default 2). */
  threshold?: number;
  /** Cycles a tripped provider stays skipped (default 3). */
  cooldownCycles?: number;
}

/**
 * Tracks consecutive provider failures so an unreachable endpoint stops costing one
 * request timeout per cycle. `shouldAttempt` consumes a cooldown cycle whenever it
 * answers `false`, so the caller must ask once per provider per refresh.
 */
export class ProviderHealth {
  private readonly states = new Map<string, { failures: number; cooldown: number }>();
  private readonly threshold: number;
  private readonly cooldownCycles: number;

  constructor(options: ProviderHealthOptions = {}) {
    this.threshold = options.threshold ?? PROVIDER_FAILURE_THRESHOLD;
    this.cooldownCycles = options.cooldownCycles ?? PROVIDER_COOLDOWN_CYCLES;
  }

  shouldAttempt(providerId: string): boolean {
    const state = this.stateFor(providerId);
    if (state.cooldown === 0) {
      return true;
    }
    state.cooldown -= 1;
    return false;
  }

  recordSuccess(providerId: string): void {
    this.states.set(providerId, { failures: 0, cooldown: 0 });
  }

  recordFailure(providerId: string): void {
    const state = this.stateFor(providerId);
    state.failures += 1;
    if (state.failures >= this.threshold) {
      state.cooldown = this.cooldownCycles;
    }
  }

  private stateFor(providerId: string): { failures: number; cooldown: number } {
    const existing = this.states.get(providerId);
    if (existing) {
      return existing;
    }
    const created = { failures: 0, cooldown: 0 };
    this.states.set(providerId, created);
    return created;
  }
}

export interface RefreshOutcome {
  quotes: Quote[];
  /** Instruments no provider could resolve, for example unknown codes. */
  missing: string[];
  providerErrors: string[];
  /** Providers skipped this cycle because their circuit is tripped. */
  skipped: string[];
}

export interface QuoteServiceOptions {
  providers: QuoteProvider[];
  timeoutMs?: number;
  /** `auto` walks every provider in order, otherwise only the matching provider id is used. */
  providerMode?: string;
  /** Shared across refreshes; pass one instance to keep the circuit state between cycles. */
  health?: ProviderHealth;
}

export class QuoteService {
  private readonly providers: QuoteProvider[];
  private readonly timeoutMs: number;
  private readonly providerMode: string;
  private readonly health: ProviderHealth;

  constructor(options: QuoteServiceOptions) {
    this.providers = options.providers;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.providerMode = options.providerMode ?? 'auto';
    this.health = options.health ?? new ProviderHealth();
  }

  async refresh(instruments: readonly Instrument[]): Promise<RefreshOutcome> {
    const quotes: Quote[] = [];
    const providerErrors: string[] = [];
    const skipped: string[] = [];
    const pending = new Map(instruments.map((instrument) => [instrument.id, instrument]));

    for (const provider of this.candidates()) {
      const batch = [...pending.values()].filter((instrument) => this.handles(provider, instrument));
      if (batch.length === 0) {
        continue;
      }
      if (!this.health.shouldAttempt(provider.id)) {
        skipped.push(provider.id);
        continue;
      }
      try {
        const fetched = await this.fetchBatched(provider, batch);
        if (fetched.length === 0) {
          this.health.recordFailure(provider.id);
        } else {
          this.health.recordSuccess(provider.id);
        }
        for (const quote of fetched) {
          quotes.push(quote);
          pending.delete(quote.id);
        }
      } catch (error) {
        this.health.recordFailure(provider.id);
        providerErrors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { quotes, missing: [...pending.keys()], providerErrors, skipped };
  }

  private candidates(): QuoteProvider[] {
    if (this.providerMode === 'auto') {
      return this.providers;
    }
    const selected = this.providers.filter((provider) => provider.id === this.providerMode);
    return selected.length > 0 ? selected : this.providers;
  }

  /**
   * A provider that does not handle an instrument never sees it, and an empty batch is not a
   * failure: `crypto:gate:LIT_USDT` alone in a watchlist must not trip the Binance circuit.
   */
  private handles(provider: QuoteProvider, instrument: Instrument): boolean {
    return provider.handles ? provider.handles(instrument) : provider.supports(instrument.market);
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
