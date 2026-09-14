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

## Coverage

| Spec | Tests | Covers |
| --- | --- | --- |
| `symbols.test.ts` | 25 | Prefix parsing, upper-casing, validation messages, duplicate handling, the full `sh`/`sz`/`bj` prefix table, provider symbol building |
| `format.test.ts` | 9 | Crypto vs stock price precision, signed percent formatting, up/down/flat direction, status bar text, tooltip markdown |
| `quoteService.test.ts` | 8 | Market routing, failover, retrying symbols a provider resolved without data, 50-symbol batching, the 8s timeout via fake timers, unresolved symbols, pinned provider |
| `providers.tencent.test.ts` | 6 | A-share and US field mapping, zero-priced stub rows, single batched request URL, skipped markets, GBK decoding in the provider |
| `providers.sina.test.ts` | 4 | A-share layout with derived change, `gb_` layout, empty payloads, the required `Referer` header |
| `providers.binanceVision.test.ts` | 4 | Batch parsing, `-1121` error mapping, zero-price rows, the JSON-array request URL |
| `http.test.ts` | 5 | GBK decoding, `defaultHttpGetBytes` success path, header and signal forwarding, `HttpError` on a non-2xx response |

Run them with `npm test`, or `npm run test:watch` while iterating.

## Live provider check

`npm run verify:live` bundles the sources with esbuild and requests one symbol per market from the
real endpoints, printing the resolved quotes, the unresolved symbols and the provider errors. Use
it after touching a parser or a symbol builder, and after capturing new fixtures:

```bash
npm run verify:live                          # cn:600519, hk:00700, us:AAPL, crypto:BTCUSDT
npm run verify:live -- cn:000001 us:BRK.B    # any watchlist entries
npm run verify:live -- --provider=sina --timeout=20
```

It exits non-zero only when a symbol stays unresolved, so a covered failover is reported without
failing the run.

## Not covered automatically

`statusBar.ts`, `watchlist.ts` and `extension.ts` need a running editor, so they rely on
`npm run compile` (strict type checking against `@types/vscode`) plus this manual checklist:

1. `F5` with an empty `codingview.watchlist` → the item reads `Add a symbol` and opens the input box.
2. Add `cn:600519` → a price and change percent appear within seconds.
3. Add `us:AAPL` and `crypto:BTCUSDT` → the item rotates every 5 seconds; hovering lists all three.
4. Set `codingview.rotateIntervalSeconds` to `2` → rotation speeds up without a reload.
5. Break the network → the last prices stay visible behind `$(warning)`; the tooltip shows the error.
6. Restore the network → the warning clears on the next cycle.
7. Run **CodingView: Remove Symbol** → the entry disappears from the status bar and from settings.

## Pitfalls

- The timeout test uses fake timers; advance them with `vi.advanceTimersByTimeAsync` before awaiting
  the refresh, otherwise the promise never settles.
- Fixture field positions mirror the provider documentation in
  [data-sources.md](data-sources.md). When a real payload gains or loses a field, update both.
- Check an expectation before trusting it. A first draft asserted three decimals for a
  `2498.78` crypto price; the implementation's two-decimal branch was correct and the test was fixed.
