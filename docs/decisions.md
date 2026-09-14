# Decisions

Each entry records what was chosen, why, and what was rejected.

## Status bar rotation over other surfaces

One left-aligned item rotates through the watchlist. Rejected: one item per symbol (VS Code gives no
layout guarantee and a large list floods the bar), a sidebar tree view, and a webview panel with
charts — both add UI surface far beyond the "glance while coding" goal. A single item also makes
colour-coding meaningful.

## One optional pinned item next to the rotation

`codingview.pinnedSymbol` puts a second item to the right of the rotating one, and the pinned symbol
leaves the rotation so it is never duplicated. Rejected: two rotating items (two timers and two
settings to keep in sync) and replacing the rotation whenever a pin is set, which would lose the
reason the extension rotates in the first place. The bar therefore gains at most one extra item, so
a long watchlist still cannot flood it.

## Keyless sources as the default

Tencent, Sina and Binance Vision need no account, so the extension works on install with no
onboarding. Rejected: requiring a Finnhub or Alpha Vantage key (extra friction, free tiers are
rate-limited) as the primary path. The `QuoteProvider` interface keeps keyed sources available
later; secrets would go to `vscode.SecretStorage`, never to settings JSON.

## Explicit market prefixes

`cn:600519`, `us:AAPL`, `crypto:BTCUSDT` are unambiguous and self-documenting. Rejected: guessing
the market from the code (`600519` vs `AAPL`), which needs heuristics that break on ambiguous
tickers, and exposing provider-native codes (`sh600519`, `gb_aapl`), which leak implementation
details into user configuration.

## Hong Kong through the existing stock providers

`hk:00700` reuses Tencent and Sina, which already answer `hk00700` and `rt_hk00700` with a keyless
request, so Hong Kong cost one market in the union, a prefix rule and a third parse branch. Rejected:
a separate provider for the Hong Kong exchange (another endpoint to keep alive for no extra data)
and leaving Hong Kong out, which contradicted the audience of developers with cross-border
portfolios.

## Watchlist in settings.json

Storing the list in `codingview.watchlist` lets users hand-edit it, share it per workspace and diff
it in git; commands write back to whichever scope the user already uses. Rejected: `globalState`
(invisible and unshareable) and a dual-source design (two code paths and confusing precedence).

## 60 second refresh, 5 second rotation

The status bar stays lively through rotation while the network sees one request per minute, which
keeps the unofficial endpoints happy. Rejected: a 5 s fetch (rate-limit risk) and a 60 s rotation
(too slow to feel live).

## Price and change percent only

Enough to judge a position at a glance and it fits one status bar line. Rejected for v1: cost basis
and quantity for profit/loss (heavier settings schema and validation) and a bare price with no
direction.

## Vitest instead of `@vscode/test-electron`

The pure core is the risky part, and Vitest runs it in milliseconds with no editor download.
Rejected: Mocha plus a real extension host as the only gate (slow, and it still cannot assert on
status bar rendering). A smoke test in a real host is a roadmap item.

## esbuild bundle plus `tsc --noEmit`

Type checking stays with `tsc`, the shipped artifact is a single minified CommonJS file. Rejected:
`tsc` emitting into the package (larger, no bundling) and webpack (more configuration for no gain).

## Publish to the Marketplace

Marketplace reaches the audience this tool is for. Rejected: local `.vsix` only (no discovery) and
Open VSX for v1 (an extra release target; adding it later is mechanical).

## GBK decoding with a UTF-8 fallback

Tencent and Sina answer in GBK, verified against live payloads (`贵州茅台`, `苹果`). `TextDecoder('gbk')`
is used, with UTF-8 as a fallback for runtimes built without full ICU. Rejected: sending an
`Accept-Charset`-style hint or decoding as Latin-1, which mangles Chinese names.

## Failover order: Tencent, then Sina

Tencent answers one batched request for mixed A-share and US symbols with change percent included.
Sina covers the same markets and one extra header, making it a cheap second attempt; live testing
showed the fallback engaging when Tencent was unreachable.

## Circuit breaker over parallel requests

Two consecutive failures skip a provider for three refresh cycles. Rejected: firing every provider
in parallel and racing them, which would multiply the request volume against unofficial endpoints
and make "which source answered" non-deterministic, and rejected: doing nothing, which pays the
request timeout again on every cycle while an endpoint is down. The cooldown is short enough that a
provider coming back is picked up within a few minutes.
