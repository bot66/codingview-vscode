import * as vscode from 'vscode';

import { formatChangePercent, formatPrice } from './format';
import { createDefaultProviders } from './providers';
import { StatusBarController } from './statusBar';
import { parseInstrument } from './symbols';
import { addSymbol, pinSymbol, readWatchlist, removeSymbol, removeSymbolEntry } from './watchlist';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('CodingView');
  const controller = new StatusBarController(createDefaultProviders(), output);

  context.subscriptions.push(
    output,
    controller,
    vscode.commands.registerCommand('codingview.addSymbol', () => addSymbol()),
    vscode.commands.registerCommand('codingview.removeSymbol', () => removeSymbol()),
    vscode.commands.registerCommand('codingview.removeSymbolEntry', (entry: string) => removeSymbolEntry(entry)),
    vscode.commands.registerCommand('codingview.pinSymbol', () => pinSymbol()),
    vscode.commands.registerCommand('codingview.refreshNow', () => controller.refreshNow()),
    vscode.commands.registerCommand('codingview.nextSymbol', () => controller.next()),
    vscode.commands.registerCommand('codingview.showList', () => showList(controller)),
  );

  controller.start();
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
    let id: string;
    try {
      id = parseInstrument(entry).id;
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
