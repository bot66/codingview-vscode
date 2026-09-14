import type { Instrument, Market } from './providers/types';

const MARKETS: readonly Market[] = ['cn', 'hk', 'us', 'crypto'];

export class SymbolFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SymbolFormatError';
  }
}

function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value);
}

export function normalizeCode(market: Market, code: string): string {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (market === 'cn') {
    return trimmed;
  }
  // Hong Kong codes are quoted with five digits, so `hk:700` and `hk:00700` are one entry.
  return market === 'hk' ? (/^\d+$/.test(trimmed) ? trimmed.padStart(5, '0') : trimmed) : trimmed.toUpperCase();
}

function assertValidCode(market: Market, code: string): void {
  switch (market) {
    case 'cn':
      if (!/^\d{6}$/.test(code)) {
        throw new SymbolFormatError('China A-share codes must be 6 digits, for example cn:600519.');
      }
      return;
    case 'hk':
      if (!/^\d{5}$/.test(code)) {
        throw new SymbolFormatError('Hong Kong codes are up to 5 digits, for example hk:00700.');
      }
      return;
    case 'us':
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(code)) {
        throw new SymbolFormatError('US tickers look like us:AAPL or us:BRK.B.');
      }
      return;
    case 'crypto':
      if (!/^[A-Z0-9]{2,20}$/.test(code)) {
        throw new SymbolFormatError('Crypto pairs look like crypto:BTCUSDT.');
      }
      return;
  }
}

export function parseInstrument(input: string): Instrument {
  const match = /^([A-Za-z]+)\s*:\s*(.+)$/.exec(input.trim());
  if (!match) {
    throw new SymbolFormatError('Missing market prefix. Use cn:600519, us:AAPL or crypto:BTCUSDT.');
  }

  const market = match[1].toLowerCase();
  if (!isMarket(market)) {
    throw new SymbolFormatError(`Unsupported market "${match[1]}". Available markets: cn, us, crypto.`);
  }

  const code = normalizeCode(market, match[2]);
  assertValidCode(market, code);

  return { id: `${market}:${code}`, market, code };
}

export interface InvalidEntry {
  entry: string;
  reason: string;
}

export interface ParsedWatchlist {
  /** Watchlist instruments in configuration order, without the pinned one. */
  instruments: Instrument[];
  /** The `codingview.pinnedSymbol` instrument, when it parses. */
  pinned?: Instrument;
  invalid: InvalidEntry[];
}

export function parseWatchlist(entries: readonly string[], pinnedEntry = ''): ParsedWatchlist {
  const instruments: Instrument[] = [];
  const invalid: InvalidEntry[] = [];
  const seen = new Set<string>();
  const pinned = parseOptionalInstrument(pinnedEntry, invalid);

  if (pinned) {
    seen.add(pinned.id);
  }

  for (const entry of entries) {
    try {
      const instrument = parseInstrument(entry);
      if (seen.has(instrument.id) || pinned?.id === instrument.id) {
        continue;
      }
      seen.add(instrument.id);
      instruments.push(instrument);
    } catch (error) {
      invalid.push({ entry, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { instruments, pinned, invalid };
}

/** The pinned setting is a single entry; a blank value means "not pinned". */
function parseOptionalInstrument(entry: string, invalid: InvalidEntry[]): Instrument | undefined {
  if (entry.trim().length === 0) {
    return undefined;
  }
  try {
    return parseInstrument(entry);
  } catch (error) {
    invalid.push({ entry, reason: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

/**
 * Tencent and Sina both use `sh`/`sz`/`bj` prefixes for mainland listings.
 * `900xxx` is Shanghai B-shares, `920xxx` belongs to the Beijing exchange, so the
 * B-share rule has to be checked before the generic `9` rule.
 */
export function exchangePrefix(code: string): 'sh' | 'sz' | 'bj' {
  if (/^900/.test(code)) {
    return 'sh';
  }
  if (/^[56]/.test(code)) {
    return 'sh';
  }
  if (/^9/.test(code) || /^(43|83|87)/.test(code)) {
    return 'bj';
  }
  if (/^[0-3]/.test(code)) {
    return 'sz';
  }
  throw new SymbolFormatError(`Cannot infer the exchange for code "${code}".`);
}

export function tencentSymbol(instrument: Instrument): string {
  switch (instrument.market) {
    case 'cn':
      return `${exchangePrefix(instrument.code)}${instrument.code}`;
    case 'hk':
      return `hk${instrument.code}`;
    case 'us':
      return `us${instrument.code}`;
    default:
      throw new SymbolFormatError('Tencent does not support the crypto market.');
  }
}

export function sinaSymbol(instrument: Instrument): string {
  switch (instrument.market) {
    case 'cn':
      return `${exchangePrefix(instrument.code)}${instrument.code}`;
    case 'hk':
      return `rt_hk${instrument.code}`;
    case 'us':
      return `gb_${instrument.code.toLowerCase()}`;
    default:
      throw new SymbolFormatError('Sina does not support the crypto market.');
  }
}
