# Roadmap

The 0.1.0 limitations and every candidate follow-up that was on this page are now implemented. This
file keeps the record of what shipped, plus the ideas that are still open.

## Shipped in 0.2.0

| Milestone | What landed | Where |
| --- | --- | --- |
| Hong Kong support | `hk:00700` in the grammar, `hk`/`rt_hk` symbol builders, HKD currency, real HK fixtures | `src/symbols.ts`, `src/providers/{tencent,sina}.ts`, `src/test/fixtures/{tencent,sina}-hk.txt` |
| Pinned item | `codingview.pinnedSymbol` plus **CodingView: Pin Symbol**; the pinned symbol leaves the rotation and gets its own item | `src/statusBar.ts`, `src/watchlist.ts` |
| Holdings and profit/loss | Object entries with `quantity` and `cost`, `Holding`/`ProfitLoss` math, money formatting, **CodingView: Set Holding** | `src/holdings.ts`, `src/format.ts`, `src/symbols.ts` |
| Keyed provider | Opt-in Finnhub provider, key in `SecretStorage`, token sent as a header, **CodingView: Set API Key** | `src/providers/finnhub.ts`, `src/extension.ts` |
| Invalid-symbol feedback | Ignored entries listed in the tooltip with their validation message and a **Remove** command link | `src/format.ts`, `src/statusBar.ts`, `src/watchlist.ts` |
| Halted instruments | A zero price with a real previous close becomes `halted: true` and renders as `Halted`, not `--` | `src/providers/{tencent,sina}.ts`, `src/format.ts` |
| Configurable request timeout | `codingview.requestTimeoutSeconds`, 2–60, default 8 | `src/settings.ts`, `src/statusBar.ts` |
| Provider circuit breaker | Two consecutive failures skip a provider for three cycles | `src/quoteService.ts` |
| US delay transparency | The tooltip says that US quotes may be delayed by the source | `src/statusBar.ts`, `src/format.ts` |
| End-to-end coverage | `@vscode/test-cli` suite covering activation, command registration, the empty placeholder, an ignored entry and the pinned item | `test/smoke/extension.test.ts` |
| CI workflow | lint, unit tests, compile, `xvfb-run` smoke test and packaging on every push and pull request | `.github/workflows/ci.yml` |
| Marketplace polish | Real screenshots and a rotation GIF, a listing-oriented README, and concrete publisher/repository metadata | `media/`, `README.md`, `package.json` |

Everything above is covered by `npm test` (unit), `npm run test:smoke` (extension host) or
`npm run verify:live` (real endpoints); see [testing.md](testing.md).

## Still open

| Candidate | Notes |
| --- | --- |
| Twelve Data or another keyed source | The `QuoteProvider` interface needs no change; the second key would reuse the `SecretStorage` bootstrap in `extension.ts`. |
| Per-market delay disclosure | Today the tooltip carries one generic US note; A-share and Hong Kong prices are delayed after their session closes as well. |
| Sidebar tree view or webview | Deliberately out of scope for a status bar extension; it would need its own rendering and tests. |
| Holdings value in the tooltip totals | The `P/L` column is per symbol; a portfolio total needs a currency assumption across markets. |
| Marketplace listing metrics | No telemetry by design, so popularity has to come from the Marketplace reports rather than from the extension. |

## Known limitations

- Prices come from unofficial endpoints without an SLA, so a field change shows up as missing data
  until the fixture and parser are updated.
- The circuit breaker is per session: restarting the editor forgets which provider was failing.
- Colour depends on `charts.green` and `charts.red` from the active theme, so a theme without chart
  colours falls back to the default foreground.
