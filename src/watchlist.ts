import * as vscode from 'vscode';

import { parseInstrument } from './symbols';

const SECTION = 'codingview';
const WATCHLIST_KEY = 'watchlist';

export function readWatchlist(): string[] {
  const value = vscode.workspace.getConfiguration(SECTION).get<string[]>(WATCHLIST_KEY, []);
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

/**
 * Writes back to the scope the user already configured: a workspace override keeps
 * working, otherwise the global setting is updated (so the list follows the user).
 */
export async function writeWatchlist(entries: string[]): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  const inspected = configuration.inspect<string[]>(WATCHLIST_KEY);
  const target =
    inspected?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await configuration.update(WATCHLIST_KEY, entries, target);
}

function canonicalId(entry: string): string | undefined {
  try {
    return parseInstrument(entry).id;
  } catch {
    return undefined;
  }
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
  const watchlist = readWatchlist();
  if (watchlist.some((entry) => canonicalId(entry) === instrument.id)) {
    void vscode.window.showInformationMessage(vscode.l10n.t('{0} is already in the watchlist.', instrument.id));
    return;
  }

  await writeWatchlist([...watchlist, instrument.id]);
  void vscode.window.showInformationMessage(vscode.l10n.t('Added {0} to the watchlist.', instrument.id));
}

export async function removeSymbol(): Promise<void> {
  const watchlist = readWatchlist();
  if (watchlist.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The watchlist is empty. Add a symbol first.'));
    return;
  }

  const picked = await vscode.window.showQuickPick(watchlist, {
    title: vscode.l10n.t('Pick a symbol to remove'),
  });
  if (picked === undefined) {
    return;
  }

  await writeWatchlist(watchlist.filter((entry) => entry !== picked));
  void vscode.window.showInformationMessage(vscode.l10n.t('Removed {0} from the watchlist.', picked));
}

/** Removes one raw entry, used by the "Remove" links in the status bar tooltip. */
export async function removeSymbolEntry(entry: string): Promise<void> {
  const watchlist = readWatchlist();
  const remaining = watchlist.filter((value) => value !== entry);
  if (remaining.length === watchlist.length) {
    return;
  }
  await writeWatchlist(remaining);
  void vscode.window.showInformationMessage(vscode.l10n.t('Removed {0} from the watchlist.', entry));
}
