# Roadmap

The 0.1.0 limitations and every candidate follow-up that was on this page are now implemented, so no
milestone is outstanding. This file keeps the record of what shipped, the ideas that are
deliberately not planned, and the limitations that remain.

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
| Release polish | Real screenshots and a rotation GIF, a README written for visitors, and a tag-driven GitHub Release workflow that attaches the `.vsix` | `media/`, `README.md`, `.github/workflows/release.yml` |

Everything above is covered by `npm test` (unit), `npm run test:smoke` (extension host) or
`npm run verify:live` (real endpoints); see [testing.md](testing.md).

## Beyond this roadmap (not planned)

These are ideas, not outstanding milestones — every milestone that was on this page is in the table
above. They are recorded so a future roadmap starts from an informed position rather than from
scratch.

| Idea | Why it is not planned now |
| --- | --- |
| A second keyed source (Twelve Data) | The keyed-provider milestone shipped with Finnhub; another source would reuse the same `QuoteProvider` interface and the `SecretStorage` bootstrap, so it is mechanical work waiting for a reason. |
| Per-market delay disclosure | The tooltip carries one US note today; A-share and Hong Kong prices are also delayed after their session closes. Splitting the note per market needs a session calendar, which is a feature of its own. |
| Sidebar tree view or webview | Rejected in [decisions.md](decisions.md): the product is a glanceable status bar item, and a webview would add a second rendering stack for no gain in the flow it serves. |
| Portfolio totals in the tooltip | A total needs one currency across A-shares, Hong Kong and US positions, which means storing an FX assumption the extension cannot verify. |
| A Visual Studio Marketplace listing | Not planned: it needs an Azure DevOps organisation and an Azure subscription, while a `.vsix` on the release page installs in one command and covers the same users. |

## Known limitations

- Prices come from unofficial endpoints without an SLA, so a field change shows up as missing data
  until the fixture and parser are updated.
- The circuit breaker is per session: restarting the editor forgets which provider was failing.
- Colour depends on `charts.green` and `charts.red` from the active theme, so a theme without chart
  colours falls back to the default foreground.
