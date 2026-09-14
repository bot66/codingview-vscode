import type { Instrument, Market, Quote } from './providers/types';

export type Direction = 'up' | 'down' | 'flat';

const CRYPTO_DECIMALS: Array<{ minimum: number; decimals: number }> = [
  { minimum: 1000, decimals: 2 },
  { minimum: 100, decimals: 3 },
  { minimum: 1, decimals: 4 },
  { minimum: 0.01, decimals: 6 },
  { minimum: 0, decimals: 8 },
];

export function formatPrice(price: number, market: Market): string {
  if (market !== 'crypto') {
    return price.toFixed(2);
  }
  const match = CRYPTO_DECIMALS.find((entry) => price >= entry.minimum);
  return price.toFixed(match ? match.decimals : 2);
}

export function formatChangePercent(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) {
    return '--';
  }
  const sign = percent > 0 ? '+' : percent < 0 ? '-' : '';
  return `${sign}${Math.abs(percent).toFixed(2)}%`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: '$' };

/** Money with two decimals and thousands separators, prefixed by a symbol when one is known. */
export function formatMoney(value: number, currency?: string): string {
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? '-' : '';
  if (!currency) {
    return `${sign}${formatted}`;
  }
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${sign}${symbol}${formatted}` : `${sign}${formatted} ${currency}`;
}

/** Same as {@link formatMoney} but always signs a non-zero value, for profit and loss. */
export function formatSignedMoney(value: number, currency?: string): string {
  const formatted = formatMoney(value, currency);
  return value > 0 ? `+${formatted}` : formatted;
}

export function directionOf(quote: Quote | undefined): Direction {
  if (!quote || quote.halted || quote.changePercent === undefined || quote.changePercent === 0) {
    return 'flat';
  }
  return quote.changePercent > 0 ? 'up' : 'down';
}

/** Tooltip price column: a halted instrument has a previous close but no current price. */
export function quotePrice(quote: Quote | undefined): string {
  return quote && !quote.halted ? formatPrice(quote.price, quote.market) : '--';
}

export interface StatusBarLabels {
  halted?: string;
}

export function statusBarText(args: {
  instrument: Instrument;
  quote?: Quote;
  stale?: boolean;
  /** Preformatted profit for a held symbol, appended after the change percent. */
  profit?: string;
  labels?: StatusBarLabels;
}): string {
  const { instrument, quote, stale, profit, labels } = args;
  const icon = stale ? '$(warning)' : '$(graph)';
  // The provider name is friendlier than the code; the code is the fallback until a quote arrives.
  const label = quote?.name ?? instrument.code;
  if (!quote) {
    return `${icon} ${label} --`;
  }
  if (quote.halted) {
    return `${icon} ${label} -- ${labels?.halted ?? 'Halted'}`;
  }
  const head = `${icon} ${label} ${formatPrice(quote.price, quote.market)} ${formatChangePercent(quote.changePercent)}`;
  return profit ? `${head} ${profit}` : head;
}

export interface TooltipRow {
  id: string;
  name: string;
  price: string;
  change: string;
  /** Preformatted profit for a held symbol; the P/L column appears when any row has one. */
  profit?: string;
}

export interface InvalidTooltipRow {
  /** The raw watchlist value that failed to parse. */
  entry: string;
  reason: string;
  /** Command URI that removes the raw entry from the settings. */
  removeLink: string;
}

export interface TooltipLabels {
  updated: (time: string) => string;
  stale: string;
  lastError: (message: string) => string;
  invalidTitle: string;
  remove: string;
}

export interface TooltipArgs {
  rows: readonly TooltipRow[];
  updatedAt?: string;
  stale: boolean;
  staleMessage?: string;
  error?: string;
  invalid?: readonly InvalidTooltipRow[];
  /** Extra lines, for example the delayed-quote disclosure. */
  notes?: readonly string[];
  labels?: Partial<TooltipLabels>;
}

export function tooltipMarkdown(args: TooltipArgs): string {
  const { rows, updatedAt, stale, staleMessage, error, invalid, notes, labels } = args;
  const updated = labels?.updated ?? ((time: string) => `Last updated ${time}`);
  const staleText = labels?.stale ?? 'Quotes are stale';
  const lastError = labels?.lastError ?? ((message: string) => `Last error: ${message}`);
  const invalidTitle = labels?.invalidTitle ?? 'Ignored entries';
  const remove = labels?.remove ?? 'Remove';

  const withProfit = rows.some((row) => row.profit !== undefined);
  const lines = withProfit
    ? ['### CodingView', '', '| Symbol | Price | Change | P/L | Name |', '| --- | --- | --- | --- | --- |']
    : ['### CodingView', '', '| Symbol | Price | Change | Name |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    const cells = [row.id, row.price, row.change];
    if (withProfit) {
      cells.push(row.profit ?? '--');
    }
    if (row.name) {
      cells.push(row.name);
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  if (invalid && invalid.length > 0) {
    lines.push('', `**${invalidTitle}**`, '', '| Entry | Problem | |', '| --- | --- | --- |');
    for (const row of invalid) {
      lines.push(`| ${row.entry} | ${row.reason} | [${remove}](${row.removeLink}) |`);
    }
  }
  if (updatedAt) {
    lines.push('', updated(updatedAt));
  }
  for (const note of notes ?? []) {
    lines.push('', `$(info) ${note}`);
  }
  if (stale) {
    lines.push('', `$(warning) ${staleMessage ?? staleText}`);
  }
  if (error) {
    lines.push('', lastError(error));
  }
  return lines.join('\n');
}
