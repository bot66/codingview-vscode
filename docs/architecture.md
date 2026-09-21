# Architecture

## Layering

| Layer | Modules | Responsibility |
| --- | --- | --- |
| Activation | `src/extension.ts` | Wires providers, controller and commands; owns the output channel |
| VS Code UI | `src/statusBar.ts`, `src/watchlist.ts` | Status bar item, timers, rendering, settings writes, quick pick flows |
| Orchestration | `src/quoteService.ts` | Groups instruments per provider, batches, times out, fails over, reports outcomes |
| Pure logic | `src/symbols.ts`, `src/format.ts`, `src/holdings.ts`, `src/cryptoSearch.ts`, `src/versioning.ts`, `src/settings.ts` | Symbol parsing, holdings and profit/loss, price/percent/status bar/tooltip formatting, crypto search ranking, versioning rules, setting defaults and clamping |
| I/O | `src/providers/*` | HTTP requests and payload parsing behind `QuoteProvider` |

The dependency direction is one-way: UI → orchestration → providers → HTTP. Only `extension.ts`,
`statusBar.ts` and `watchlist.ts` import `vscode`, which keeps every other module testable under
plain Node.

## Interfaces

- `Instrument { id, market, code, source? }` — `id` is the canonical `market:CODE` string, `market`
  is `'cn' | 'us' | 'crypto'`, and `source` (`'binance' | 'gate'`) is the crypto provider a pair was
  written for, as in `crypto:gate:LITUSDT`.
- `Quote { id, market, code, price, name?, prevClose?, change?, changePercent?, halted?, currency?, asOf?, source }`.
- `Holding { id, quantity, cost }` and `ProfitLoss { value, cost, profit, percent? }` from `holdings.ts`.
- `QuoteProvider { id, displayName, supports(market), handles?(instrument), fetch(instruments, signal) }`
  — returns one quote per resolvable instrument, omits the rest, and throws on transport or payload
  failure. `handles` narrows `supports` to the instruments a provider actually serves, so a
  source-qualified pair never reaches the other crypto providers.
- `HttpGetBytes(url, init) => Promise<Uint8Array>` — injectable, so specs replay recorded payloads
  and assert headers without touching the network.
- `QuoteService.refresh(instruments) => { quotes, missing, providerErrors }`.

## Refresh cycle

1. `statusBar.ts` reads `codingview.*`, parses the watchlist (dropping invalid and duplicate
   entries) and prunes quotes belonging to removed symbols.
2. `QuoteService.refresh` walks providers in order — Finnhub (only when a key is cached), Tencent,
   Sina, Binance Vision, Gate. Each provider receives the still-unresolved instruments it `handles`.
3. Instruments are chunked 50 at a time; every chunk runs under its own `AbortController` with the
   `codingview.requestTimeoutSeconds` timeout (8 s by default).
4. A provider that throws is recorded in `providerErrors` and its instruments stay pending for the
   next provider. A provider that returns fewer quotes than requested also leaves the remainder
   pending, so an unknown code is retried against the fallback source. A provider that answers with
   nothing at all counts as a failure too — unless `handles` left it without any instrument, which
   is not a failure but a provider that simply has nothing to do this cycle.
5. Arriving quotes merge into the controller's map; instruments that stay pending become `missing`
   and are the only ones marked stale for the cycle. A stale instrument keeps its previous price
   behind `$(warning)`, or renders `--` when it was never priced.
6. `ProviderHealth` counts consecutive failures per provider and, after the second one, skips that
   provider for three cycles (`PROVIDER_FAILURE_THRESHOLD`, `PROVIDER_COOLDOWN_CYCLES`). Any success
   clears the counter. Skipped ids come back in `RefreshOutcome.skipped` and are logged, so an
   unreachable Tencent host costs one timeout instead of one per minute.
7. The next refresh is scheduled with `refreshIntervalSeconds` (60s default), or with
   `backoffSeconds(failures)` = 60 → 120 → 240 → 300 seconds when a cycle had errors or missing
   symbols. Both counters reset after a fully clean cycle.

## Rendering

- One left-aligned rotating item (`StatusBarAlignment.Left`, priority 100, name `CodingView`) plus,
  when `codingview.pinnedSymbol` parses, a second item at priority 101 that never rotates. The
  pinned symbol is fetched even when it is not in the watchlist and is removed from the rotation
  list, so it is never shown twice. A third item at priority 99 places a clickable `charts.green`
  refresh icon immediately to the right of the prices; it runs `codingview.refreshNow` and spins
  while the request is active. The button stays hidden while the watchlist has nothing to fetch, so
  the empty state keeps its single actionable item.
- Text: `$(graph) 贵州茅台 600519 1277.96 +0.22%` — `Quote.name` in front of the configured code, so
  the item stays readable while the code still identifies the listing. Before the first quote there
  is no name, and the item reads `$(graph) 600519 --`. Only the symbols the last cycle could not
  resolve prefix `$(warning)`; one priced through a fallback provider stays `$(graph)`. Binance
  Vision publishes no coin names, so its crypto quotes use the base asset
  (`BTC BTCUSDT 78494.01 +1.73%`), while a Gate pair carries the real name
  (`Lighter LITUSDT 4.2140 -0.40%`). A suspended instrument renders as `$(graph) 贵州茅台 600519 -- 停牌`
  from `Quote.halted`, so it is not confused with an unknown code. An empty watchlist shows a
  clickable `$(graph) Add a symbol`.
- Colour: `ThemeColor('charts.green')` when the change is positive, `charts.red` when negative,
  no colour when flat or when `colorByDirection` is false.
- Tooltip: markdown table of every symbol with price, change percent and name (the code again when a
  quote has no name), the newest provider timestamp, and — when relevant — a `$(warning)` marker on
  the price of the stale rows, a line explaining that they show the previous prices or have no data,
  the last error, a delayed-quote note and the invalid entries with a command link to remove them.
- Rotation runs on `setInterval`. The item's command is `codingview.showList`, or
  `codingview.addSymbol` while the watchlist is empty.

## State and lifecycle

- Timers live in `StatusBarController` and are recreated on every `codingview.*` configuration
  change, which also triggers an immediate refresh.
- Diagnostics go to the `CodingView` output channel: ignored invalid entries, provider errors,
  unresolved symbols and unexpected exceptions.
- Everything the extension creates is a `Disposable` registered on the extension context, so
  deactivation tears it down cleanly.
