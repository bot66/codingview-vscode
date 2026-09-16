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

## Finnhub as an opt-in keyed source

The `QuoteProvider` interface made the keyed source a drop-in addition, so Finnhub sits first in the
failover order but reports that it supports nothing until a key is stored. The token goes to
`SecretStorage` and to the `X-Finnhub-Token` header. Rejected: a key field in `settings.json`
(secrets end up in dotfiles, diffs and screenshots) and a token in the query string (tokens leak
into URLs, logs and error messages). Twelve Data was left for later; the interface needs no change
to add it.

## Explicit market prefixes

`cn:600519`, `us:AAPL`, `crypto:BTCUSDT` are unambiguous and self-documenting. Rejected: guessing
the market from the code (`600519` vs `AAPL`), which needs heuristics that break on ambiguous
tickers, and exposing provider-native codes (`sh600519`, `gb_aapl`), which leak implementation
details into user configuration.

## Crypto identity as `source:PAIR`

A ticker is only unique inside one exchange, and crypto has many coins sharing one: `LITUSDT` is a
0.743 Binance listing while Lighter trades as `LIT_USDT` on Gate for 4.234. `crypto:gate:LIT_USDT`
therefore carries the source as part of the identity — short aliases (`binance`, `gate`) instead of
the provider ids (`binance-vision`), the same reasoning as the market prefixes above. Unqualified
`crypto:BTCUSDT` keeps its old meaning: Binance first, Gate only when Binance resolves nothing, so
existing watchlists do not change source. Rejected: contract addresses as the identity
(`crypto:eth:0x232c…`), which are unambiguous but unreadable in `settings.json` and would need an
address → pair resolver that Gate's public API does not provide; CoinGecko ids, because
`api.coingecko.com` was unreachable from the development sandbox and a parser without a real fixture
cannot be trusted; and user-defined aliases in settings, which leave the "which exchange spells it
how" homework with the user.

## Gate as the second crypto source

Gate's public API is keyless and carries what a bare pair cannot: the coin name and the contract, so
**CodingView: Search Crypto** can offer `Lighter (LIT) · ETH 0x232c…` instead of asking the user to
guess. It sits *after* Binance Vision in the failover order because Binance is the broader market
and because `crypto:BTCUSDT` must keep resolving there. The same `QuoteProvider` interface carries
it — the only addition is `handles(instrument)`, so a `crypto:gate:` entry never enters the Binance
batch and an all-Gate watchlist cannot trip the Binance circuit breaker. Rejected: making Gate the
first crypto source (it would silently move existing crypto entries to a different exchange), and a
single "crypto search" provider separated from the quote path (two caches, two places to fix when
Gate changes).

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

## Holdings as objects inside the watchlist

`codingview.watchlist` accepts `{ "symbol": …, "quantity": …, "cost": … }` next to the plain symbol
strings, so a position travels with the symbol it belongs to and the schema stays a single list.
Rejected: a second `codingview.holdings` map (two sources to keep in sync and a duplicate symbol
grammar) and a separate holdings file (invisible, unshareable, no diff). Both fields are required
together because a quantity without a cost basis cannot produce a percentage, and the status bar
shows the profit only when a price is available.

## Vitest instead of `@vscode/test-electron`

The pure core is the risky part, and Vitest runs it in milliseconds with no editor download.
Rejected: Mocha plus a real extension host as the only gate (slow, and it still cannot assert on
status bar rendering). A smoke test in a real host is a roadmap item.

## esbuild bundle plus `tsc --noEmit`

Type checking stays with `tsc`, the shipped artifact is a single minified CommonJS file. Rejected:
`tsc` emitting into the package (larger, no bundling) and webpack (more configuration for no gain).

## GitHub Releases as the only distribution channel

The extension ships as a `.vsix` attached to a GitHub Release, cut by
`.github/workflows/release.yml` from a `v*` tag. Installing one file is a single command, the
release page doubles as the changelog, and the repository stays the source of truth. Rejected:
publishing to the Visual Studio Marketplace, which today means running an Azure DevOps organisation
with an Azure subscription behind it — infrastructure this project has no use for — and rejected:
an Open VSX listing, which would not appear in the official VS Code extension view that the tool
targets. Building from source stays available, it is just not the supported way to install.

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

## A version per shipped change

Every change that can reach the `.vsix` bumps the version and becomes a GitHub Release: MINOR for a
feature or a behaviour change, PATCH for a fix, dependency or packaging change. Documentation, agent
notes, CI workflows, dev scripts and tests keep the released version and ride along with the next
shipped change — they cannot alter what users install, so a bump would only burn a version number
and publish a Release whose `.vsix` is identical. The repository has one distribution channel, so
the version number is the receipt that a change actually shipped — and batching the bumps until
release day is how `package.json` reached `0.2.0` while `package-lock.json` stayed on `0.1.0`. The
rule is therefore enforced rather than remembered: `scripts/check-version.mjs` (pure rules in
`src/versioning.ts`, unit tested) fails CI when the three files disagree, when the changelog section
is missing or empty, or when a change touching shipped paths reuses a version an earlier commit
already released, and `scripts/bump-version.mjs` moves all three files in one command. Rejected:
staying with release-day bumps (the drift above, plus `.vsix` files that cannot be told apart by
version); rejected: deriving the version from commit messages or timestamps, which would need a
release toolchain and still would not make the `.vsix` distinguishable to a user installing it by
hand; and rejected (0.3.1): bumping for docs-only commits, which is how the rule above was narrowed.
