# Testing

## Strategy

All automated tests are Vitest unit tests running in the node environment
(`src/test/**/*.test.ts`). Logic is deliberately split so that parsers, formatting and
orchestration carry no `vscode` import; only the thin UI layer needs a real editor.

Two rules keep the suite honest:

- Providers receive an injected `httpGet`, so tests replay recorded payloads and assert request
  URLs and headers instead of mocking modules or hitting the network.
- Fixtures under `src/test/fixtures/` are copied from real responses. Tencent and Sina payloads
  arrive as GBK; the decoding test builds GBK bytes inline (`苹果` = `C6 BB B9 FB`) and asserts the
  decoded name, while the other specs run the already-decoded text through the parsers.
  Two fixtures are exceptions and say so by name: `tencent-halted-synthetic.txt` is the real
  A-share row with the price fields zeroed, and `finnhub-quote.json` follows the documented
  response shape because the endpoint needs a key. `finnhub-error.json` is a real 401 body. The two
  Gate catalogue fixtures (`gate-catalog-currencies.json`, `gate-catalog-tickers.json`) are the real
  rows for `LIT`, `BTC`, `LITE3L`, `UROLITHINA` and `LITE_OLD` lifted out of the live `/spot/currencies`
  and `/spot/tickers` payloads, whose full bodies are ≈2.1 MB and ≈542 KB.

## Coverage

| Spec | Tests | Covers |
| --- | --- | --- |
| `symbols.test.ts` | 43 | Prefix parsing, upper-casing, source-qualified crypto pairs, validation messages, duplicate handling, the full `sh`/`sz`/`bj` prefix table, crypto pair splitting, provider symbol building |
| `format.test.ts` | 9 | Crypto vs stock price precision, signed percent formatting, up/down/flat direction, status bar text, tooltip markdown |
| `quoteService.test.ts` | 16 | Market routing, failover, retrying symbols a provider resolved without data, `handles` routing for source-qualified pairs, 50-symbol batching, the 8s timeout via fake timers, unresolved symbols, pinned provider |
| `cryptoSearch.test.ts` | 9 | Candidate ranking (exact ticker, ticker prefix, name prefix, name substring), USDT market and delisting filters, contract selection, result cap |
| `versioning.test.ts` | 14 | Version rules: manifest/lockfile/changelog agreement, missing or empty changelog sections, reused versions, version ordering, the two version rewrites, heading rename |
| `providers.tencent.test.ts` | 6 | A-share and US field mapping, zero-priced stub rows, single batched request URL, skipped markets, GBK decoding in the provider |
| `providers.sina.test.ts` | 4 | A-share layout with derived change, `gb_` layout, empty payloads, the required `Referer` header |
| `providers.binanceVision.test.ts` | 8 | Batch parsing, `-1121` error mapping, per-symbol isolation of an unknown symbol, zero-price rows, the JSON-array request URL, source filtering |
| `providers.gate.test.ts` | 13 | Ticker parsing with derived change, coin names and the per-currency cache, unknown pairs as unresolved, bare-pair rewriting, the catalogue cache, its retry and its timeout, source filtering |
| `http.test.ts` | 5 | GBK decoding, `defaultHttpGetBytes` success path, header and signal forwarding, `HttpError` on a non-2xx response |

Run them with `npm test`, or `npm run test:watch` while iterating.

## Live provider check

`npm run verify:live` bundles the sources with esbuild and requests one symbol per market from the
real endpoints, printing the resolved quotes, the unresolved symbols and the provider errors. Use
it after touching a parser or a symbol builder, and after capturing new fixtures:

```bash
npm run verify:live                          # the four stock/crypto samples plus crypto:gate:LITUSDT
npm run verify:live -- cn:000001 us:BRK.B    # any watchlist entries
npm run verify:live -- crypto:LITUSDT crypto:gate:LITUSDT    # the same ticker on two sources
npm run verify:live -- --provider=sina --timeout=20
```

It exits non-zero only when a symbol stays unresolved, so a covered failover is reported without
failing the run.

## Extension-host smoke test

`npm run test:smoke` compiles `test/smoke/**` with `tsconfig.smoke.json` and then runs
`@vscode/test-cli` against a downloaded VS Code build. VS Code exposes no API to read a status bar
item, so `StatusBarController.snapshot()` reports the text, the tooltip and the pinned text, and the
controller registers a `codingview.test.snapshot` command **only** in `ExtensionMode.Test`. The
suite asserts:

1. the extension activates,
2. every command listed in `contributes.commands` is registered,
3. an empty watchlist renders `$(graph) Add a symbol`,
4. adding `cn:600519` switches the item to that symbol without a network round trip,
5. an invalid entry appears in the tooltip behind a `command:codingview.removeSymbolEntry` link,
6. a pinned symbol leaves the rotation and renders in its own item.

It is the only gate that needs a graphical session, so CI runs it under `xvfb-run`. Colours, rotation
feel and the command flows still deserve the manual pass below.

The suite pins `codingview.provider` to `binance-vision` for its duration: that provider only serves
crypto, so the stock symbols it uses never pick up a live quote and the rendered text stays
deterministic (the item shows the code, not a provider name). Live rendering is covered by
`npm run verify:live` and the unit tests instead.

## Manual checklist

1. `F5` with an empty `codingview.watchlist` → the item reads `Add a symbol` and opens the input box.
2. Add `cn:600519` → a price and change percent appear within seconds.
3. Add `us:AAPL` and `crypto:BTCUSDT` → the item rotates every 5 seconds; hovering lists all three.
4. Set `codingview.rotateIntervalSeconds` to `2` → rotation speeds up without a reload.
5. Break the network → the last prices stay visible behind `$(warning)`; the tooltip shows the error.
6. Restore the network → the warning clears on the next cycle.
7. Run **CodingView: Remove Symbol** → the entry disappears from the status bar and from settings.
8. Run **CodingView: Set Holding** → the status bar shows the profit and the tooltip gains a P/L
   column.

## Pitfalls

- The timeout test uses fake timers; advance them with `vi.advanceTimersByTimeAsync` before awaiting
  the refresh, otherwise the promise never settles.
- Fixture field positions mirror the provider documentation in
  [data-sources.md](data-sources.md). When a real payload gains or loses a field, update both.
- Check an expectation before trusting it. A first draft asserted three decimals for a
  `2498.78` crypto price; the implementation's two-decimal branch was correct and the test was fixed.
