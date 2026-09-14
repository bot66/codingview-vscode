import { describe, expect, test } from 'vitest';

import {
  directionOf,
  formatChangePercent,
  formatMoney,
  formatPrice,
  formatSignedMoney,
  quotePrice,
  statusBarText,
  tooltipMarkdown,
} from '../format';
import type { Instrument, Quote } from '../providers/types';

const instrument: Instrument = { id: 'cn:600519', market: 'cn', code: '600519' };

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'cn:600519',
    market: 'cn',
    code: '600519',
    price: 1277.96,
    prevClose: 1275.16,
    change: 2.8,
    changePercent: 0.22,
    source: 'tencent',
    ...overrides,
  };
}

describe('formatPrice', () => {
  test('uses 2 decimals for A-shares and US stocks', () => {
    expect(formatPrice(1277.96, 'cn')).toBe('1277.96');
    expect(formatPrice(333.4, 'us')).toBe('333.40');
  });

  test('scales decimals for crypto prices', () => {
    expect(formatPrice(78372.01, 'crypto')).toBe('78372.01');
    expect(formatPrice(2498.78, 'crypto')).toBe('2498.78');
    expect(formatPrice(654.321, 'crypto')).toBe('654.321');
    expect(formatPrice(1.2345, 'crypto')).toBe('1.2345');
    expect(formatPrice(0.00001234, 'crypto')).toBe('0.00001234');
  });
});

describe('formatChangePercent', () => {
  test('always shows the sign of the change', () => {
    expect(formatChangePercent(0.22)).toBe('+0.22%');
    expect(formatChangePercent(-1.2)).toBe('-1.20%');
    expect(formatChangePercent(0)).toBe('0.00%');
    expect(formatChangePercent(undefined)).toBe('--');
  });
});

describe('directionOf', () => {
  test('classifies up, down and flat quotes', () => {
    expect(directionOf(quote())).toBe('up');
    expect(directionOf(quote({ changePercent: -0.5 }))).toBe('down');
    expect(directionOf(quote({ changePercent: 0 }))).toBe('flat');
    expect(directionOf(undefined)).toBe('flat');
  });
});

describe('statusBarText', () => {
  test('falls back to the code when the quote carries no name', () => {
    expect(statusBarText({ instrument, quote: quote() })).toBe('$(graph) 600519 1277.96 +0.22%');
  });

  test('shows the provider name instead of the code', () => {
    expect(statusBarText({ instrument, quote: quote({ name: '贵州茅台' }) })).toBe(
      '$(graph) 贵州茅台 1277.96 +0.22%',
    );
  });

  test('marks stale quotes with a warning icon', () => {
    expect(statusBarText({ instrument, quote: quote(), stale: true })).toBe('$(warning) 600519 1277.96 +0.22%');
  });

  test('shows a placeholder when the quote is missing', () => {
    expect(statusBarText({ instrument })).toBe('$(graph) 600519 --');
  });

  test('appends the profit when the symbol is held', () => {
    expect(statusBarText({ instrument, quote: quote(), profit: '+¥280.00' })).toBe(
      '$(graph) 600519 1277.96 +0.22% +¥280.00',
    );
  });

  test('says a halted instrument has no price rather than showing 0.00', () => {
    const halted = quote({ price: 0, change: undefined, changePercent: undefined, halted: true });

    expect(statusBarText({ instrument, quote: halted })).toBe('$(graph) 600519 -- Halted');
    expect(statusBarText({ instrument, quote: halted, labels: { halted: '停牌' } })).toBe('$(graph) 600519 -- 停牌');
    expect(statusBarText({ instrument, quote: { ...halted, name: '贵州茅台' } })).toBe('$(graph) 贵州茅台 -- Halted');
  });
});

describe('quotePrice', () => {
  test('renders the last price, or a placeholder when there is none', () => {
    expect(quotePrice(quote())).toBe('1277.96');
    expect(quotePrice(undefined)).toBe('--');
    expect(quotePrice(quote({ price: 0, halted: true }))).toBe('--');
  });
});

describe('formatMoney', () => {
  test('uses the currency symbol when one is known', () => {
    expect(formatMoney(1277.96, 'CNY')).toBe('¥1,277.96');
    expect(formatMoney(430.6, 'HKD')).toBe('HK$430.60');
    expect(formatMoney(333.4, 'USD')).toBe('$333.40');
  });

  test('falls back to the currency code', () => {
    expect(formatMoney(78487.62, 'USDT')).toBe('78,487.62 USDT');
  });

  test('always shows the sign of a profit or a loss', () => {
    expect(formatSignedMoney(-280, 'CNY')).toBe('-¥280.00');
    expect(formatSignedMoney(280, 'CNY')).toBe('+¥280.00');
    expect(formatSignedMoney(0, 'CNY')).toBe('¥0.00');
  });
});

describe('tooltipMarkdown', () => {
  test('lists every symbol with its price and change', () => {
    const markdown = tooltipMarkdown({
      rows: [
        { id: 'cn:600519', name: '贵州茅台', price: '1277.96', change: '+0.22%' },
        { id: 'cn:000001', name: '', price: '--', change: '--' },
      ],
      updatedAt: '2026-09-14 16:14:50',
      stale: false,
    });

    expect(markdown).toContain('| cn:600519 | 1277.96 | +0.22% | 贵州茅台 |');
    expect(markdown).toContain('| cn:000001 | -- | -- |');
    expect(markdown).toContain('Last updated 2026-09-14 16:14:50');
  });

  test('reports stale data and the last error', () => {
    const markdown = tooltipMarkdown({
      rows: [{ id: 'cn:600519', name: '', price: '1277.96', change: '+0.22%' }],
      stale: true,
      staleMessage: 'Quotes are stale',
      error: 'HTTP 500',
    });

    expect(markdown).toContain('Quotes are stale');
    expect(markdown).toContain('HTTP 500');
  });

  test('lists ignored entries with a link that removes them', () => {
    const markdown = tooltipMarkdown({
      rows: [],
      stale: false,
      invalid: [
        {
          entry: 'jp:7203',
          reason: 'Unsupported market "jp".',
          removeLink: 'command:codingview.removeSymbolEntry?%5B%22jp%3A7203%22%5D',
        },
      ],
    });

    expect(markdown).toContain('Ignored entries');
    expect(markdown).toContain(
      '| jp:7203 | Unsupported market "jp". | [Remove](command:codingview.removeSymbolEntry?%5B%22jp%3A7203%22%5D) |',
    );
  });

  test('translates the invalid-entry section', () => {
    const markdown = tooltipMarkdown({
      rows: [],
      stale: false,
      invalid: [{ entry: 'jp:7203', reason: 'unsupported', removeLink: 'command:x' }],
      labels: { invalidTitle: '被忽略的标的', remove: '移除' },
    });

    expect(markdown).toContain('被忽略的标的');
    expect(markdown).toContain('[移除](command:x)');
  });

  test('omits the invalid-entry section when every entry parses', () => {
    const markdown = tooltipMarkdown({ rows: [], stale: false });

    expect(markdown).not.toContain('Ignored entries');
  });

  test('adds a profit column when a row is held', () => {
    const markdown = tooltipMarkdown({
      rows: [
        { id: 'cn:600519', name: '贵州茅台', price: '1277.96', change: '+0.22%', profit: '+¥280.00' },
        { id: 'us:AAPL', name: '', price: '333.40', change: '+0.34%' },
      ],
      stale: false,
    });

    expect(markdown).toContain('| Symbol | Price | Change | P/L | Name |');
    expect(markdown).toContain('| cn:600519 | 1277.96 | +0.22% | +¥280.00 | 贵州茅台 |');
    expect(markdown).toContain('| us:AAPL | 333.40 | +0.34% | -- |');
  });

  test('keeps the four column table when nothing is held', () => {
    const markdown = tooltipMarkdown({
      rows: [{ id: 'cn:600519', name: '', price: '1277.96', change: '+0.22%' }],
      stale: false,
    });

    expect(markdown).toContain('| Symbol | Price | Change | Name |');
    expect(markdown).not.toContain('P/L');
  });

  test('adds notes such as the delay disclosure', () => {
    const markdown = tooltipMarkdown({
      rows: [{ id: 'us:AAPL', name: '', price: '333.40', change: '+0.34%' }],
      stale: false,
      notes: ['US quotes may be delayed by the source.'],
    });

    expect(markdown).toContain('US quotes may be delayed by the source.');
  });
});
