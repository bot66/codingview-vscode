import { tencentSymbol } from '../symbols';
import { decodeGbk, defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';

export const TENCENT_ENDPOINT = 'https://qt.gtimg.cn/q=';

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUsable(value: number | undefined): value is number {
  return value !== undefined && value > 0;
}

export function parseTencentPayload(text: string): Array<{ symbol: string; fields: string[] }> {
  const rows: Array<{ symbol: string; fields: string[] }> = [];
  const pattern = /v_([A-Za-z0-9_.]+)="([^"]*)"/g;
  let match = pattern.exec(text);
  while (match !== null) {
    rows.push({ symbol: match[1], fields: match[2].split('~') });
    match = pattern.exec(text);
  }
  return rows;
}

/**
 * Tencent returns `v_<symbol>="<fields joined by ~>"` rows. Index 3 is the last
 * price, 4 the previous close, 30 the timestamp, 31/32 the change and the change
 * percent. Unknown codes come back as a zero priced stub and are dropped here.
 */
export function parseTencentResponse(text: string, bySymbol: Map<string, Instrument>): Quote[] {
  const quotes: Quote[] = [];

  for (const { symbol, fields } of parseTencentPayload(text)) {
    const instrument = bySymbol.get(symbol);
    if (!instrument) {
      continue;
    }
    const price = toNumber(fields[3]);
    const prevClose = toNumber(fields[4]);
    if (!isUsable(prevClose)) {
      continue;
    }
    // An unknown code comes back as a zero-priced stub without a previous close; a halted
    // instrument keeps its previous close and only loses the price.
    const halted = !isUsable(price);
    quotes.push({
      id: instrument.id,
      market: instrument.market,
      code: instrument.code,
      name: fields[1] || undefined,
      price: halted ? 0 : price,
      prevClose,
      change: halted ? undefined : toNumber(fields[31]),
      changePercent: halted ? undefined : toNumber(fields[32]),
      halted: halted ? true : undefined,
      currency: currencyFor(instrument.market, fields[35]),
      asOf: fields[30] || undefined,
      source: 'tencent',
    });
  }

  return quotes;
}

/** Tencent reports the US currency in the payload; A-shares and Hong Kong are fixed. */
function currencyFor(market: Instrument['market'], reported: string | undefined): string {
  switch (market) {
    case 'us':
      return reported || 'USD';
    case 'hk':
      return 'HKD';
    default:
      return 'CNY';
  }
}

export interface TencentProviderOptions {
  httpGet?: HttpGetBytes;
}

export function createTencentProvider(options: TencentProviderOptions = {}): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;

  return {
    id: 'tencent',
    displayName: 'Tencent',
    supports: (market) => market === 'cn' || market === 'hk' || market === 'us',
    fetch: async (instruments, signal) => {
      const targets = instruments.filter((instrument) => instrument.market !== 'crypto');
      if (targets.length === 0) {
        return [];
      }

      const bySymbol = new Map<string, Instrument>();
      for (const instrument of targets) {
        bySymbol.set(tencentSymbol(instrument), instrument);
      }

      const url = `${TENCENT_ENDPOINT}${[...bySymbol.keys()].join(',')}`;
      const bytes = await httpGet(url, { signal });
      return parseTencentResponse(decodeGbk(bytes), bySymbol);
    },
  };
}
