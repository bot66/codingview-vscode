import { sinaSymbol } from '../symbols';
import { decodeGbk, defaultHttpGetBytes } from './http';
import type { HttpGetBytes, Instrument, Quote, QuoteProvider } from './types';

export const SINA_ENDPOINT = 'https://hq.sinajs.cn/list=';
export const SINA_HEADERS = { Referer: 'https://finance.sina.com.cn/' };

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function parseSinaPayload(text: string): Array<{ symbol: string; fields: string[] }> {
  const rows: Array<{ symbol: string; fields: string[] }> = [];
  const pattern = /var hq_str_([A-Za-z0-9_]+)="([^"]*)"/g;
  let match = pattern.exec(text);
  while (match !== null) {
    rows.push({ symbol: match[1], fields: match[2].split(',') });
    match = pattern.exec(text);
  }
  return rows;
}

/**
 * Sina reuses the sh/sz/bj symbol for mainland listings (`name,open,prevClose,price,...`)
 * but switches to a `gb_` layout for US tickers (`name,price,changePercent,time,change,...`).
 * The endpoint answers 403 unless a finance.sina.com.cn Referer is sent.
 */
export function parseSinaResponse(text: string, bySymbol: Map<string, Instrument>): Quote[] {
  const quotes: Quote[] = [];

  for (const { symbol, fields } of parseSinaPayload(text)) {
    const instrument = bySymbol.get(symbol);
    if (!instrument || fields.length < 5) {
      continue;
    }

    if (instrument.market === 'us') {
      const price = toNumber(fields[1]);
      const change = toNumber(fields[4]);
      if (!isUsable(price) || change === undefined) {
        continue;
      }
      quotes.push({
        id: instrument.id,
        market: instrument.market,
        code: instrument.code,
        name: fields[0] || undefined,
        price,
        prevClose: round(price - change),
        change,
        changePercent: toNumber(fields[2]),
        currency: 'USD',
        asOf: fields[3] || undefined,
        source: 'sina',
      });
      continue;
    }

    if (instrument.market === 'hk') {
      const price = toNumber(fields[6]);
      const prevClose = toNumber(fields[3]);
      if (!isUsable(price) || !isUsable(prevClose)) {
        continue;
      }
      quotes.push({
        id: instrument.id,
        market: instrument.market,
        code: instrument.code,
        name: fields[1] || fields[0] || undefined,
        price,
        prevClose,
        change: toNumber(fields[7]) ?? round(price - prevClose),
        changePercent: toNumber(fields[8]),
        currency: 'HKD',
        asOf: fields[17] && fields[18] ? `${fields[17]} ${fields[18]}` : undefined,
        source: 'sina',
      });
      continue;
    }

    const price = toNumber(fields[3]);
    const prevClose = toNumber(fields[2]);
    if (!isUsable(price) || !isUsable(prevClose)) {
      continue;
    }
    const change = round(price - prevClose);
    quotes.push({
      id: instrument.id,
      market: instrument.market,
      code: instrument.code,
      name: fields[0] || undefined,
      price,
      prevClose,
      change,
      changePercent: round((change / prevClose) * 100),
      currency: 'CNY',
      asOf: fields[30] && fields[31] ? `${fields[30]} ${fields[31]}` : undefined,
      source: 'sina',
    });
  }

  return quotes;
}

function isUsable(value: number | undefined): value is number {
  return value !== undefined && value > 0;
}

export interface SinaProviderOptions {
  httpGet?: HttpGetBytes;
}

export function createSinaProvider(options: SinaProviderOptions = {}): QuoteProvider {
  const httpGet = options.httpGet ?? defaultHttpGetBytes;

  return {
    id: 'sina',
    displayName: 'Sina',
    supports: (market) => market === 'cn' || market === 'hk' || market === 'us',
    fetch: async (instruments, signal) => {
      const targets = instruments.filter((instrument) => instrument.market !== 'crypto');
      if (targets.length === 0) {
        return [];
      }

      const bySymbol = new Map<string, Instrument>();
      for (const instrument of targets) {
        bySymbol.set(sinaSymbol(instrument), instrument);
      }

      const url = `${SINA_ENDPOINT}${[...bySymbol.keys()].join(',')}`;
      const bytes = await httpGet(url, { headers: SINA_HEADERS, signal });
      return parseSinaResponse(decodeGbk(bytes), bySymbol);
    },
  };
}
