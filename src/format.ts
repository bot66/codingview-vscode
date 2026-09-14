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
  labels?: StatusBarLabels;
}): string {
  const { instrument, quote, stale, labels } = args;
  const icon = stale ? '$(warning)' : '$(graph)';
  if (!quote) {
    return `${icon} ${instrument.code} --`;
  }
  if (quote.halted) {
    return `${icon} ${instrument.code} -- ${labels?.halted ?? 'Halted'}`;
  }
  return `${icon} ${instrument.code} ${formatPrice(quote.price, quote.market)} ${formatChangePercent(quote.changePercent)}`;
}

export interface TooltipRow {
  id: string;
  name: string;
  price: string;
  change: string;
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
  labels?: Partial<TooltipLabels>;
}

export function tooltipMarkdown(args: TooltipArgs): string {
  const { rows, updatedAt, stale, staleMessage, error, invalid, labels } = args;
  const updated = labels?.updated ?? ((time: string) => `Last updated ${time}`);
  const staleText = labels?.stale ?? 'Quotes are stale';
  const lastError = labels?.lastError ?? ((message: string) => `Last error: ${message}`);
  const invalidTitle = labels?.invalidTitle ?? 'Ignored entries';
  const remove = labels?.remove ?? 'Remove';

  const lines = ['### CodingView', '', '| Symbol | Price | Change | Name |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(
      row.name
        ? `| ${row.id} | ${row.price} | ${row.change} | ${row.name} |`
        : `| ${row.id} | ${row.price} | ${row.change} |`,
    );
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
  if (stale) {
    lines.push('', `$(warning) ${staleMessage ?? staleText}`);
  }
  if (error) {
    lines.push('', lastError(error));
  }
  return lines.join('\n');
}
