import * as vscode from 'vscode';

import {
  directionOf,
  formatChangePercent,
  formatSignedMoney,
  type InvalidTooltipRow,
  quotePrice,
  statusBarText,
  tooltipMarkdown,
  type TooltipRow,
} from './format';
import { profitLoss, type Holding } from './holdings';
import type { Instrument, Quote, QuoteProvider } from './providers/types';
import { backoffSeconds, ProviderHealth, QuoteService } from './quoteService';
import { clampedSeconds, SETTINGS_DEFAULTS, SETTINGS_MINIMUMS, type SecondsSetting } from './settings';
import { parseWatchlist, type InvalidEntry } from './symbols';

const SETTINGS = 'codingview';
const REMOVE_ENTRY_COMMAND = 'codingview.removeSymbolEntry';

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly pinnedItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly quotes = new Map<string, Quote>();
  private readonly health = new ProviderHealth();
  private instruments: Instrument[] = [];
  private pinnedInstrument?: Instrument;
  private holdings = new Map<string, Holding>();
  private invalid: InvalidEntry[] = [];
  private index = 0;
  private stale = false;
  private lastError?: string;
  private failures = 0;
  private refreshing = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private rotateTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly providers: QuoteProvider[],
    private readonly output: vscode.OutputChannel,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'CodingView';
    this.item.command = 'codingview.showList';
    this.pinnedItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    this.pinnedItem.name = 'CodingView pinned';
    this.pinnedItem.command = 'codingview.showList';
  }

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTINGS)) {
          this.output.appendLine('Configuration changed, reloading the watchlist.');
          this.reload();
        }
      }),
    );
    this.item.show();
    this.reload();
  }

  dispose(): void {
    this.clearTimers();
    this.item.dispose();
    this.pinnedItem.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  /** Advances the rotation, used by the `codingview.nextSymbol` command. */
  next(): void {
    if (this.instruments.length < 2) {
      return;
    }
    this.index = (this.index + 1) % this.instruments.length;
    this.render();
  }

  /** Rotates to a specific instrument, used when the user picks a row from the list. */
  focus(id: string): void {
    const position = this.instruments.findIndex((instrument) => instrument.id === id);
    if (position >= 0) {
      this.index = position;
      this.render();
    }
  }

  quoteFor(id: string): Quote | undefined {
    return this.quotes.get(id);
  }

  /**
   * Current rendering, used by the extension-host smoke test: VS Code gives no API to read a
   * status bar item, so the controller reports what it wrote.
   */
  snapshot(): { text: string; tooltip: string; pinnedText?: string } {
    const tooltip = this.item.tooltip;
    return {
      text: this.item.text ?? '',
      tooltip: typeof tooltip === 'string' ? tooltip : (tooltip?.value ?? ''),
      pinnedText: this.pinnedInstrument ? this.pinnedItem.text : undefined,
    };
  }

  refreshNow(): void {
    this.scheduleRefresh(0);
  }

  private settings(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SETTINGS);
  }

  private readSeconds(key: SecondsSetting): number {
    return clampedSeconds(this.settings().get<number>(key), SETTINGS_DEFAULTS[key], SETTINGS_MINIMUMS[key]);
  }

  private clearTimers(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer);
      this.rotateTimer = undefined;
    }
  }

  private reload(): void {
    const { instruments, pinned, holdings, invalid } = parseWatchlist(
      this.settings().get<unknown[]>('watchlist', []),
      this.settings().get<string>('pinnedSymbol', ''),
    );
    this.instruments = instruments;
    this.pinnedInstrument = pinned;
    this.holdings = holdings;
    this.invalid = invalid;
    if (this.index >= instruments.length) {
      this.index = 0;
    }
    const wanted = new Set(this.refreshTargets().map((instrument) => instrument.id));
    for (const id of [...this.quotes.keys()]) {
      if (!wanted.has(id)) {
        this.quotes.delete(id);
      }
    }
    if (invalid.length > 0) {
      this.output.appendLine(
        `Ignoring invalid entries: ${invalid.map((entry) => `${entry.entry} (${entry.reason})`).join('; ')}`,
      );
    }

    this.clearTimers();
    this.rotateTimer = setInterval(() => this.next(), this.readSeconds('rotateIntervalSeconds') * 1000);
    this.render();
    this.scheduleRefresh(this.failures > 0 ? backoffSeconds(this.failures) * 1000 : 0);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      void this.refresh();
    }, delayMs);
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }

    const refreshMs = this.readSeconds('refreshIntervalSeconds') * 1000;
    const targets = this.refreshTargets();
    if (targets.length === 0) {
      this.scheduleRefresh(refreshMs);
      return;
    }

    this.refreshing = true;
    try {
      const service = new QuoteService({
        providers: this.providers,
        providerMode: this.settings().get<string>('provider', 'auto'),
        timeoutMs: this.readSeconds('requestTimeoutSeconds') * 1000,
        health: this.health,
      });
      const outcome = await service.refresh(targets);

      for (const quote of outcome.quotes) {
        this.quotes.set(quote.id, quote);
      }

      if (outcome.providerErrors.length > 0 || outcome.missing.length > 0) {
        this.failures += 1;
        this.stale = true;
        this.lastError = outcome.providerErrors[0];
      } else {
        this.failures = 0;
        this.stale = false;
        this.lastError = undefined;
      }

      if (outcome.providerErrors.length > 0) {
        this.output.appendLine(`Refresh failed: ${outcome.providerErrors.join('; ')}`);
      }
      if (outcome.skipped.length > 0) {
        this.output.appendLine(`Skipping providers with a tripped circuit: ${outcome.skipped.join(', ')}`);
      }
      if (outcome.missing.length > 0) {
        this.output.appendLine(`No data for: ${outcome.missing.join(', ')}`);
      }
    } catch (error) {
      this.failures += 1;
      this.stale = true;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Unexpected refresh error: ${this.lastError}`);
    } finally {
      this.refreshing = false;
    }

    this.render();
    this.scheduleRefresh(this.failures > 0 ? backoffSeconds(this.failures) * 1000 : refreshMs);
  }

  private render(): void {
    if (this.instruments.length === 0) {
      this.item.text = `$(graph) ${vscode.l10n.t('Add a symbol')}`;
      this.item.command = 'codingview.addSymbol';
      this.item.color = undefined;
      // Keep the ignored-entry list reachable even when nothing parseable is left.
      this.item.tooltip =
        this.invalid.length > 0 ? this.tooltip() : vscode.l10n.t('Click to manage the watchlist');
    } else {
      const instrument = this.instruments[Math.min(this.index, this.instruments.length - 1)];
      this.item.command = 'codingview.showList';
      this.decorate(this.item, instrument);
    }

    if (!this.pinnedInstrument) {
      this.pinnedItem.hide();
      return;
    }
    this.pinnedItem.command = 'codingview.showList';
    this.decorate(this.pinnedItem, this.pinnedInstrument);
    this.pinnedItem.show();
  }

  /** Instruments the cycle has to resolve: the pinned one first, then the rotation. */
  private refreshTargets(): Instrument[] {
    return this.pinnedInstrument ? [this.pinnedInstrument, ...this.instruments] : [...this.instruments];
  }

  private decorate(item: vscode.StatusBarItem, instrument: Instrument): void {
    const quote = this.quotes.get(instrument.id);
    const holding = this.holdings.get(instrument.id);
    item.text = statusBarText({
      instrument,
      quote,
      stale: this.stale,
      profit: holding && quote ? this.profitText(quote, holding, false) : undefined,
      labels: { halted: vscode.l10n.t('Halted') },
    });
    item.color = this.colorFor(quote);
    item.tooltip = this.tooltip();
  }

  private colorFor(quote: Quote | undefined): vscode.ThemeColor | undefined {
    if (!quote || !this.settings().get<boolean>('colorByDirection', true)) {
      return undefined;
    }
    const direction = directionOf(quote);
    if (direction === 'up') {
      return new vscode.ThemeColor('charts.green');
    }
    return direction === 'down' ? new vscode.ThemeColor('charts.red') : undefined;
  }

  private tooltip(): vscode.MarkdownString {
    const rows: TooltipRow[] = this.instruments.map((instrument) => {
      const quote = this.quotes.get(instrument.id);
      return {
        id: instrument.id,
        name: quote?.name ?? (quote ? instrument.code : ''),
        price: quotePrice(quote),
        change: quote?.halted ? vscode.l10n.t('Halted') : formatChangePercent(quote?.changePercent),
        profit: quote ? this.profitText(quote, this.holdings.get(instrument.id), true) : undefined,
      };
    });
    const updatedAt = [...this.quotes.values()]
      .map((quote) => quote.asOf)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    const markdown = tooltipMarkdown({
      rows,
      updatedAt,
      stale: this.stale,
      error: this.lastError,
      invalid: this.invalidRows(),
      notes: this.tooltipNotes(),
      labels: {
        updated: (time) => vscode.l10n.t('Updated {0}', time),
        stale: vscode.l10n.t('Quotes are stale'),
        lastError: (message) => vscode.l10n.t('Last error: {0}', message),
        invalidTitle: vscode.l10n.t('Ignored entries'),
        remove: vscode.l10n.t('Remove'),
      },
    });
    const tooltip = new vscode.MarkdownString(markdown);
    tooltip.isTrusted = { enabledCommands: [REMOVE_ENTRY_COMMAND] };
    return tooltip;
  }

  private invalidRows(): InvalidTooltipRow[] {
    return this.invalid.map((entry) => ({
      entry: entry.entry,
      reason: entry.reason,
      removeLink: `command:${REMOVE_ENTRY_COMMAND}?${encodeURIComponent(JSON.stringify([entry.entry]))}`,
    }));
  }

  /** US quotes arrive with a delay on some endpoints; say so instead of letting users assume. */
  private tooltipNotes(): string[] {
    const hasUs = this.pinnedInstrument?.market === 'us' || this.instruments.some((item) => item.market === 'us');
    return hasUs ? [vscode.l10n.t('US quotes may be delayed by the source.')] : [];
  }

  /** Profit for a held instrument, optionally with the percentage, or undefined without a price. */
  private profitText(quote: Quote, holding: Holding | undefined, withPercent: boolean): string | undefined {
    if (!holding) {
      return undefined;
    }
    const result = profitLoss(quote, holding);
    if (!result) {
      return undefined;
    }
    const money = formatSignedMoney(result.profit, quote.currency);
    return withPercent && result.percent !== undefined
      ? `${money} (${formatChangePercent(result.percent)})`
      : money;
  }
}
