import * as vscode from 'vscode';

import type { CryptoCandidate } from './cryptoSearch';
import { formatChangePercent, formatPrice } from './format';
import type { GateCatalog } from './providers/gate';
import type { Instrument } from './providers/types';
import { compactCryptoPair, parseInstrument, watchlistEntrySymbol } from './symbols';

const SECTION = 'codingview';
const WATCHLIST_KEY = 'watchlist';
const PINNED_KEY = 'pinnedSymbol';

/** Raw entries: a `market:CODE` string, or an object with a `symbol` plus an optional holding. */
export function readWatchlist(): unknown[] {
  const value = vscode.workspace.getConfiguration(SECTION).get<unknown[]>(WATCHLIST_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function readPinnedSymbol(): string {
  const value = vscode.workspace.getConfiguration(SECTION).get<string>(PINNED_KEY, '');
  return typeof value === 'string' ? value : '';
}

/**
 * Writes back to the scope the user already configured: a workspace override keeps
 * working, otherwise the global setting is updated (so the list follows the user).
 */
async function writeSetting(key: string, value: unknown): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  const inspected = configuration.inspect(key);
  const target =
    inspected?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await configuration.update(key, value, target);
}

export async function writeWatchlist(entries: unknown[]): Promise<void> {
  await writeSetting(WATCHLIST_KEY, entries);
}

function canonicalId(entry: unknown): string | undefined {
  const symbol = watchlistEntrySymbol(entry);
  if (symbol === undefined) {
    return undefined;
  }
  try {
    return parseInstrument(symbol).id;
  } catch {
    return undefined;
  }
}

/** Quick pick entries that keep the raw value index, so object entries survive a round trip. */
function watchlistItems(watchlist: readonly unknown[]): vscode.QuickPickItem[] {
  return watchlist.map((entry) => {
    const symbol = watchlistEntrySymbol(entry);
    return {
      label: symbol ?? JSON.stringify(entry),
      description: typeof entry === 'string' ? undefined : vscode.l10n.t('holding'),
    };
  });
}

function parseNumber(value: string, minimum: number, exclusive: boolean): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || (exclusive ? parsed <= minimum : parsed < minimum)) {
    return undefined;
  }
  return parsed;
}

export async function addSymbol(): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Add a symbol to the watchlist'),
    placeHolder: vscode.l10n.t('Example: cn:600519, us:AAPL, crypto:BTCUSDT'),
    validateInput: (value) => {
      if (value.trim().length === 0) {
        return vscode.l10n.t('Add a symbol to the watchlist');
      }
      try {
        parseInstrument(value);
        return undefined;
      } catch (error) {
        return vscode.l10n.t('Invalid symbol: {0}', error instanceof Error ? error.message : String(error));
      }
    },
  });
  if (input === undefined) {
    return;
  }

  const instrument = parseInstrument(input);
  await addToWatchlist(instrument);
}

/** Adds one canonical id, telling the user when it is already tracked. */
async function addToWatchlist(instrument: Instrument): Promise<void> {
  const watchlist = readWatchlist();
  if (watchlist.some((entry) => canonicalId(entry) === instrument.id)) {
    void vscode.window.showInformationMessage(vscode.l10n.t('{0} is already in the watchlist.', instrument.id));
    return;
  }

  await writeWatchlist([...watchlist, instrument.id]);
  void vscode.window.showInformationMessage(vscode.l10n.t('Added {0} to the watchlist.', instrument.id));
}

/**
 * Turns Gate's currency catalogue into a pick list, so a small coin is found by name instead of
 * guessed from a ticker that another coin also uses.
 */
export async function searchCrypto(catalog: GateCatalog): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Search a cryptocurrency by name or ticker'),
    placeHolder: vscode.l10n.t('Example: lighter, LIT'),
  });
  if (query === undefined || query.trim().length === 0) {
    return;
  }

  let matches: CryptoCandidate[];
  try {
    matches = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Searching Gate.io…') },
      () => catalog.search(query),
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t('Could not reach Gate.io: {0}', error instanceof Error ? error.message : String(error)),
    );
    return;
  }
  if (matches.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No cryptocurrency matched "{0}".', query.trim()));
    return;
  }

  const items = matches.map((match) => ({
    label: `${match.name} (${match.currency})`,
    description: `${formatPrice(match.price, 'crypto')} USDT ${formatChangePercent(match.changePercent)}`,
    detail: [
      match.chain && match.address ? `${match.chain} ${match.address}` : undefined,
      `crypto:gate:${compactCryptoPair(match.pair)}`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' · '),
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Pick a cryptocurrency to add'),
  });
  if (picked === undefined) {
    return;
  }

  try {
    await addToWatchlist(parseInstrument(`crypto:gate:${matches[items.indexOf(picked)].pair}`));
  } catch (error) {
    // The code came from Gate, so a rejected one is a grammar gap, not a user mistake: say which
    // one failed instead of leaving an unhandled rejection in the log.
    void vscode.window.showErrorMessage(
      vscode.l10n.t('Could not add {0}: {1}', picked.label, error instanceof Error ? error.message : String(error)),
    );
  }
}

export async function removeSymbol(): Promise<void> {
  const watchlist = readWatchlist();
  if (watchlist.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The watchlist is empty. Add a symbol first.'));
    return;
  }

  const items = watchlistItems(watchlist);
  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Pick a symbol to remove'),
  });
  if (picked === undefined) {
    return;
  }

  const index = items.indexOf(picked);
  await writeWatchlist(watchlist.filter((_entry, position) => position !== index));
  void vscode.window.showInformationMessage(vscode.l10n.t('Removed {0} from the watchlist.', picked.label));
}

/** Removes one raw entry, used by the "Remove" links in the status bar tooltip. */
export async function removeSymbolEntry(entry: string): Promise<void> {
  const watchlist = readWatchlist();
  const remaining = watchlist.filter((value) => value !== entry);
  if (remaining.length < watchlist.length) {
    await writeWatchlist(remaining);
    void vscode.window.showInformationMessage(vscode.l10n.t('Removed {0} from the watchlist.', entry));
    return;
  }
  if (readPinnedSymbol() === entry) {
    await writeSetting(PINNED_KEY, '');
    void vscode.window.showInformationMessage(vscode.l10n.t('Removed {0} from the watchlist.', entry));
  }
}

/** Pins one symbol next to the rotating item; an empty answer clears the pin. */
export async function pinSymbol(): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Pin a symbol next to the rotating item, or clear the box to unpin it'),
    placeHolder: vscode.l10n.t('Example: cn:600519, us:AAPL, crypto:BTCUSDT'),
    value: readPinnedSymbol(),
    validateInput: (value) => {
      if (value.trim().length === 0) {
        return undefined;
      }
      try {
        parseInstrument(value);
        return undefined;
      } catch (error) {
        return vscode.l10n.t('Invalid symbol: {0}', error instanceof Error ? error.message : String(error));
      }
    },
  });
  if (input === undefined) {
    return;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    await writeSetting(PINNED_KEY, '');
    void vscode.window.showInformationMessage(vscode.l10n.t('Unpinned the status bar item.'));
    return;
  }

  const id = parseInstrument(trimmed).id;
  await writeSetting(PINNED_KEY, id);
  void vscode.window.showInformationMessage(vscode.l10n.t('Pinned {0} to the status bar.', id));
}

/** Records the quantity and average cost for one watchlist entry, for the profit and loss columns. */
export async function setHolding(): Promise<void> {
  const watchlist = readWatchlist();
  if (watchlist.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The watchlist is empty. Add a symbol first.'));
    return;
  }

  const items = watchlistItems(watchlist);
  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Pick a symbol to set a holding for'),
  });
  if (picked === undefined) {
    return;
  }
  const index = items.indexOf(picked);
  const id = canonicalId(watchlist[index]);
  if (id === undefined) {
    void vscode.window.showErrorMessage(vscode.l10n.t('{0} is not a valid symbol.', picked.label));
    return;
  }

  const quantityInput = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('How many units do you hold? Leave the box empty to clear the holding.'),
    placeHolder: '100',
    validateInput: (value) =>
      value.trim().length === 0 || parseNumber(value, 0, true) !== undefined
        ? undefined
        : vscode.l10n.t('Enter a number greater than zero.'),
  });
  if (quantityInput === undefined) {
    return;
  }

  const next = [...watchlist];
  if (quantityInput.trim().length === 0) {
    next[index] = id;
    await writeWatchlist(next);
    void vscode.window.showInformationMessage(vscode.l10n.t('Cleared the holding for {0}.', id));
    return;
  }

  const costInput = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('What did one unit cost on average, in the quote currency?'),
    placeHolder: '1500',
    validateInput: (value) =>
      parseNumber(value, 0, false) !== undefined ? undefined : vscode.l10n.t('Enter a number that is zero or greater.'),
  });
  if (costInput === undefined) {
    return;
  }

  next[index] = { symbol: id, quantity: parseNumber(quantityInput, 0, true), cost: parseNumber(costInput, 0, false) };
  await writeWatchlist(next);
  void vscode.window.showInformationMessage(vscode.l10n.t('Saved the holding for {0}.', id));
}
