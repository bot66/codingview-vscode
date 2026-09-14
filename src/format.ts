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
  if (!quote || quote.changePercent === undefined || quote.changePercent === 0) {
    return 'flat';
  }
  return quote.changePercent > 0 ? 'up' : 'down';
}

export function statusBarText(args: { instrument: Instrument; quote?: Quote; stale?: boolean }): string {
  const { instrument, quote, stale } = args;
  const icon = stale ? '$(warning)' : '$(graph)';
  const body = quote
    ? `${instrument.code} ${formatPrice(quote.price, quote.market)} ${formatChangePercent(quote.changePercent)}`
    : `${instrument.code} --`;
  return `${icon} ${body}`;
}

export interface TooltipRow {
  id: string;
  name: string;
  price: string;
  change: string;
}

export interface TooltipLabels {
  updated: (time: string) => string;
  stale: string;
  lastError: (message: string) => string;
}

export interface TooltipArgs {
  rows: readonly TooltipRow[];
  updatedAt?: string;
  stale: boolean;
  staleMessage?: string;
  error?: string;
  labels?: Partial<TooltipLabels>;
}

export function tooltipMarkdown(args: TooltipArgs): string {
  const { rows, updatedAt, stale, staleMessage, error, labels } = args;
  const updated = labels?.updated ?? ((time: string) => `Last updated ${time}`);
  const staleText = labels?.stale ?? 'Quotes are stale';
  const lastError = labels?.lastError ?? ((message: string) => `Last error: ${message}`);

  const lines = ['### CodingView', '', '| Symbol | Price | Change | Name |', '| --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(
      row.name
        ? `| ${row.id} | ${row.price} | ${row.change} | ${row.name} |`
        : `| ${row.id} | ${row.price} | ${row.change} |`,
    );
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
