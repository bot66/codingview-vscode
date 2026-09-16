import * as vscode from 'vscode';

import { formatChangePercent, formatPrice } from './format';
import { GateCatalog, createDefaultProviders } from './providers';
import { StatusBarController } from './statusBar';
import { parseInstrument, watchlistEntrySymbol } from './symbols';
import {
  addSymbol,
  pinSymbol,
  readWatchlist,
  removeSymbol,
  removeSymbolEntry,
  searchCrypto,
  setHolding,
} from './watchlist';

const FINNHUB_SECRET_KEY = 'codingview.finnhubApiKey';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('CodingView');
  // The keyed provider asks for its secret synchronously, so `SecretStorage` is mirrored here.
  const finnhubApiKey = { current: undefined as string | undefined };
  // One cache for the Gate provider and the search command, so a search warms the quote path.
  const gateCatalog = new GateCatalog();
  const controller = new StatusBarController(
    createDefaultProviders({ finnhubApiKey: () => finnhubApiKey.current, gateCatalog }),
    output,
  );

  const readSecrets = async (): Promise<void> => {
    finnhubApiKey.current = await context.secrets.get(FINNHUB_SECRET_KEY);
  };

  context.subscriptions.push(
    output,
    controller,
    vscode.commands.registerCommand('codingview.addSymbol', () => addSymbol()),
    vscode.commands.registerCommand('codingview.searchCrypto', () => searchCrypto(gateCatalog)),
    vscode.commands.registerCommand('codingview.removeSymbol', () => removeSymbol()),
    vscode.commands.registerCommand('codingview.removeSymbolEntry', (entry: string) => removeSymbolEntry(entry)),
    vscode.commands.registerCommand('codingview.pinSymbol', () => pinSymbol()),
    vscode.commands.registerCommand('codingview.setHolding', () => setHolding()),
    vscode.commands.registerCommand('codingview.refreshNow', () => controller.refreshNow()),
    vscode.commands.registerCommand('codingview.nextSymbol', () => controller.next()),
    vscode.commands.registerCommand('codingview.showList', () => showList(controller)),
    vscode.commands.registerCommand('codingview.setApiKey', () => setApiKey(context)),
    context.secrets.onDidChange((event) => {
      if (event.key === FINNHUB_SECRET_KEY) {
        void readSecrets().then(() => controller.refreshNow());
      }
    }),
  );

  controller.start();
  void readSecrets().then(() => controller.refreshNow());

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand('codingview.test.snapshot', () => controller.snapshot()),
    );
  }
}

export function deactivate(): void {
  // Every resource is registered as a disposable on the extension context.
}

async function showList(controller: StatusBarController): Promise<void> {
  const entries = readWatchlist();
  if (entries.length === 0) {
    await addSymbol();
    return;
  }

  const items: vscode.QuickPickItem[] = [];
  for (const entry of entries) {
    const symbol = watchlistEntrySymbol(entry);
    if (symbol === undefined) {
      continue;
    }
    let id: string;
    try {
      id = parseInstrument(symbol).id;
    } catch {
      continue;
    }
    const quote = controller.quoteFor(id);
    items.push({
      label: id,
      description: quote
        ? `${formatPrice(quote.price, quote.market)} ${formatChangePercent(quote.changePercent)}`
        : '--',
      detail: quote?.name,
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('CodingView watchlist'),
  });
  if (picked) {
    controller.focus(picked.label);
  }
}

/** Stores the Finnhub key in `SecretStorage`, never in settings JSON. */
async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const stored = await context.secrets.get(FINNHUB_SECRET_KEY);
  const input = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Paste a Finnhub API key (finnhub.io). Leave the box empty to stop using Finnhub.'),
    placeHolder: 'c1234567890abcdefghijklmnopqrstuv',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length === 0 || /^[A-Za-z0-9_-]{10,}$/.test(value.trim())
        ? undefined
        : vscode.l10n.t('That does not look like a Finnhub key.'),
  });
  if (input === undefined) {
    return;
  }

  const key = input.trim();
  if (key.length === 0) {
    await context.secrets.delete(FINNHUB_SECRET_KEY);
    if (stored !== undefined) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Cleared the stored Finnhub API key.'));
    }
    return;
  }

  await context.secrets.store(FINNHUB_SECRET_KEY, key);
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Stored the Finnhub API key. US quotes will use it from the next refresh.'),
  );
}
