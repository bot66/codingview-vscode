import { afterEach, describe, expect, test, vi } from 'vitest';

import { ProviderHealth, QuoteService, backoffSeconds } from '../quoteService';
import type { Instrument, Market, Quote, QuoteProvider } from '../providers/types';
import { parseInstrument } from '../symbols';

function instrument(id: string, market: Market, code: string): Instrument {
  return { id, market, code };
}

function quoteFor(target: Instrument, price: number, source: string): Quote {
  return { id: target.id, market: target.market, code: target.code, price, source };
}

function stubProvider(
  id: string,
  markets: Market[],
  fetchImpl: (instruments: Instrument[], signal?: AbortSignal) => Promise<Quote[]>,
): QuoteProvider & { calls: Instrument[][] } {
  const calls: Instrument[][] = [];
  return {
    id,
    displayName: id,
    calls,
    supports: (market: Market) => markets.includes(market),
    fetch: async (instruments, signal) => {
      calls.push(instruments);
      return fetchImpl(instruments, signal);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('backoffSeconds', () => {
  test('doubles the delay up to the 5 minute cap', () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(240);
    expect(backoffSeconds(4)).toBe(300);
    expect(backoffSeconds(9)).toBe(300);
  });
});

describe('ProviderHealth', () => {
  test('allows every attempt while the provider keeps succeeding', () => {
    const health = new ProviderHealth({ threshold: 2, cooldownCycles: 3 });

    for (let cycle = 0; cycle < 5; cycle += 1) {
      expect(health.shouldAttempt('tencent')).toBe(true);
      health.recordSuccess('tencent');
    }
  });

  test('skips a provider for the cooldown after repeated failures', () => {
    const health = new ProviderHealth({ threshold: 2, cooldownCycles: 3 });
    const attempts = Array.from({ length: 8 }, () => {
      if (!health.shouldAttempt('tencent')) {
        return false;
      }
      health.recordFailure('tencent');
      return true;
    });

    expect(attempts).toEqual([true, true, false, false, false, true, false, false]);
  });

  test('keeps providers independent', () => {
    const health = new ProviderHealth({ threshold: 1, cooldownCycles: 2 });

    health.recordFailure('tencent');

    expect(health.shouldAttempt('tencent')).toBe(false);
    expect(health.shouldAttempt('sina')).toBe(true);
  });

  test('a success clears the failure count', () => {
    const health = new ProviderHealth({ threshold: 2, cooldownCycles: 3 });

    health.recordFailure('tencent');
    health.recordSuccess('tencent');
    health.recordFailure('tencent');

    expect(health.shouldAttempt('tencent')).toBe(true);
  });
});

describe('QuoteService.refresh', () => {
  test('routes each market to the providers that support it', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const crypto = instrument('crypto:BTCUSDT', 'crypto', 'BTCUSDT');
    const stocksProvider = stubProvider('tencent', ['cn', 'us'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1277.96, 'tencent')),
    );
    const cryptoProvider = stubProvider('binance-vision', ['crypto'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 78372.01, 'binance-vision')),
    );
    const service = new QuoteService({ providers: [stocksProvider, cryptoProvider] });

    const outcome = await service.refresh([stocks, crypto]);

    expect(outcome.quotes.map((entry) => entry.id)).toEqual(['cn:600519', 'crypto:BTCUSDT']);
    expect(stocksProvider.calls).toEqual([[stocks]]);
    expect(cryptoProvider.calls).toEqual([[crypto]]);
    expect(outcome.missing).toEqual([]);
  });

  test('falls back to the next provider when the first one fails', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const failing = stubProvider('tencent', ['cn'], async () => {
      throw new Error('socket hang up');
    });
    const backup = stubProvider('sina', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1276.5, 'sina')),
    );
    const service = new QuoteService({ providers: [failing, backup] });

    const outcome = await service.refresh([stocks]);

    expect(outcome.quotes).toHaveLength(1);
    expect(outcome.quotes[0].source).toBe('sina');
    expect(outcome.providerErrors).toEqual(['tencent: socket hang up']);
    expect(outcome.missing).toEqual([]);
  });

  test('retries symbols that a provider resolved without data', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const empty = stubProvider('tencent', ['cn'], async () => []);
    const backup = stubProvider('sina', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1276.5, 'sina')),
    );
    const service = new QuoteService({ providers: [empty, backup] });

    const outcome = await service.refresh([stocks]);

    expect(empty.calls).toHaveLength(1);
    expect(backup.calls).toEqual([[stocks]]);
    expect(outcome.quotes[0].source).toBe('sina');
  });

  test('routes each crypto instrument only to the providers that handle it', async () => {
    const unqualified = parseInstrument('crypto:ETHUSDT');
    const gateOnly = parseInstrument('crypto:gate:LIT_USDT');
    // Binance resolves nothing for the unqualified pair, so Gate prices both instruments.
    const binance = stubProvider('binance-vision', ['crypto'], async () => []);
    binance.handles = (instrument) => instrument.source === undefined || instrument.source === 'binance';
    const gate = stubProvider('gate', ['crypto'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 4.234, 'gate')),
    );
    gate.handles = (instrument) => instrument.source === undefined || instrument.source === 'gate';
    const service = new QuoteService({ providers: [binance, gate] });

    const outcome = await service.refresh([unqualified, gateOnly]);

    expect(binance.calls).toEqual([[unqualified]]);
    expect(gate.calls).toEqual([[unqualified, gateOnly]]);
    expect(outcome.missing).toEqual([]);
  });

  test('does not count a provider with no handled instruments as failing', async () => {
    const gateOnly = parseInstrument('crypto:gate:LIT_USDT');
    const binance = stubProvider('binance-vision', ['crypto'], async () => []);
    binance.handles = (instrument) => instrument.source === undefined || instrument.source === 'binance';
    const gate = stubProvider('gate', ['crypto'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 4.234, 'gate')),
    );
    gate.handles = (instrument) => instrument.source === undefined || instrument.source === 'gate';
    const health = new ProviderHealth({ threshold: 2, cooldownCycles: 3 });
    const service = new QuoteService({ providers: [binance, gate], health });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const outcome = await service.refresh([gateOnly]);

      expect(outcome.quotes.map((entry) => entry.source)).toEqual(['gate']);
      expect(outcome.providerErrors).toEqual([]);
      expect(outcome.skipped).toEqual([]);
    }
    expect(binance.calls).toEqual([]);
  });

  test('splits large watchlists into batches of 50', async () => {
    const provider = stubProvider('tencent', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1, 'tencent')),
    );
    const service = new QuoteService({ providers: [provider] });
    const watchlist = Array.from({ length: 120 }, (_, index) =>
      instrument(`cn:${600000 + index}`, 'cn', `${600000 + index}`),
    );

    const outcome = await service.refresh(watchlist);

    expect(provider.calls.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(outcome.quotes).toHaveLength(120);
  });

  test('aborts a provider that exceeds the timeout', async () => {
    vi.useFakeTimers();
    const stocks = instrument('cn:600519', 'cn', '600519');
    const hanging = stubProvider(
      'tencent',
      ['cn'],
      (_instruments, signal) =>
        new Promise<Quote[]>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const service = new QuoteService({ providers: [hanging], timeoutMs: 8000 });

    const pending = service.refresh([stocks]);
    await vi.advanceTimersByTimeAsync(8000);
    const outcome = await pending;

    expect(outcome.quotes).toEqual([]);
    expect(outcome.missing).toEqual(['cn:600519']);
    expect(outcome.providerErrors).toEqual(['tencent: aborted']);
  });

  test('reports symbols that no provider could resolve', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const empty = stubProvider('tencent', ['cn'], async () => []);
    const service = new QuoteService({ providers: [empty] });

    const outcome = await service.refresh([stocks]);

    expect(outcome.quotes).toEqual([]);
    expect(outcome.missing).toEqual(['cn:600519']);
  });

  test('honours an explicit provider selection', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const tencent = stubProvider('tencent', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1, 'tencent')),
    );
    const sina = stubProvider('sina', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 2, 'sina')),
    );
    const service = new QuoteService({ providers: [tencent, sina], providerMode: 'sina' });

    const outcome = await service.refresh([stocks]);

    expect(tencent.calls).toEqual([]);
    expect(outcome.quotes[0].source).toBe('sina');
  });

  test('skips a tripped provider and reports it as skipped', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const failing = stubProvider('tencent', ['cn'], async () => {
      throw new Error('socket hang up');
    });
    const backup = stubProvider('sina', ['cn'], async (instruments) =>
      instruments.map((target) => quoteFor(target, 1276.5, 'sina')),
    );
    const health = new ProviderHealth({ threshold: 1, cooldownCycles: 2 });
    const service = new QuoteService({ providers: [failing, backup], health });

    const first = await service.refresh([stocks]);
    const second = await service.refresh([stocks]);

    expect(first.quotes[0].source).toBe('sina');
    expect(first.skipped).toEqual([]);
    expect(failing.calls).toHaveLength(1);
    expect(second.quotes[0].source).toBe('sina');
    expect(second.skipped).toEqual(['tencent']);
    expect(failing.calls).toHaveLength(1);
  });

  test('retries a skipped provider once the cooldown elapses', async () => {
    const stocks = instrument('cn:600519', 'cn', '600519');
    const failing = stubProvider('tencent', ['cn'], async () => {
      throw new Error('socket hang up');
    });
    const health = new ProviderHealth({ threshold: 1, cooldownCycles: 2 });
    const service = new QuoteService({ providers: [failing], health });

    await service.refresh([stocks]);
    await service.refresh([stocks]);
    await service.refresh([stocks]);
    await service.refresh([stocks]);

    expect(failing.calls).toHaveLength(2);
  });
});
