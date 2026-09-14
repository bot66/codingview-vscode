import type { Quote } from './providers/types';

/** Quantity and average cost basis for one watchlist entry. */
export interface Holding {
  id: string;
  quantity: number;
  cost: number;
}

export interface ProfitLoss {
  /** Price times quantity, in the quote's currency. */
  value: number;
  /** Cost basis times quantity. */
  cost: number;
  profit: number;
  /** Undefined when the cost basis is zero, because a percentage would be meaningless. */
  percent?: number;
}

export interface EntryHolding {
  holding?: Holding;
  error?: string;
}

/**
 * Reads the optional holding from a raw watchlist entry. A plain symbol string has none;
 * an object entry has to carry a quantity and a cost basis together.
 */
export function holdingFromEntry(raw: unknown, id: string): EntryHolding {
  if (typeof raw === 'string') {
    return {};
  }
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'Each watchlist entry is a symbol string or an object with a "symbol" field.' };
  }

  const record = raw as Record<string, unknown>;
  const hasQuantity = record.quantity !== undefined;
  const hasCost = record.cost !== undefined;
  if (!hasQuantity && !hasCost) {
    return {};
  }
  if (!hasQuantity || !hasCost) {
    return { error: 'Set the "quantity" and "cost" fields together, for example {"symbol": "cn:600519", "quantity": 100, "cost": 1500}.' };
  }

  const quantity = Number(record.quantity);
  const cost = Number(record.cost);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'The "quantity" field must be a number greater than zero.' };
  }
  if (!Number.isFinite(cost) || cost < 0) {
    return { error: 'The "cost" field must be a number that is zero or greater.' };
  }

  return { holding: { id, quantity, cost } };
}

/** Market value and profit for a resolved quote, or undefined when there is no price to use. */
export function profitLoss(quote: Quote, holding: Holding): ProfitLoss | undefined {
  if (quote.halted || quote.price <= 0) {
    return undefined;
  }
  const value = quote.price * holding.quantity;
  const cost = holding.cost * holding.quantity;
  const profit = value - cost;
  return { value, cost, profit, percent: cost > 0 ? (profit / cost) * 100 : undefined };
}
