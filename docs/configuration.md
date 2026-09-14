# Configuration, symbols and commands

## Symbol grammar

Every watchlist entry is `<market>:<code>`.

| Market | Pattern | Example | Notes |
| --- | --- | --- | --- |
| `cn` | 6 digits | `cn:600519` | Exchange prefix derived from the code |
| `hk` | up to 5 digits | `hk:00700`, `hk:700` | Zero-padded to five digits on save |
| `us` | Letter, then up to 9 letters, digits, `.` or `-` | `us:AAPL`, `us:BRK.B` | Upper-cased on save |
| `crypto` | 2–20 of `A-Z0-9` | `crypto:BTCUSDT` | Any Binance spot pair; upper-cased on save |

Duplicates are compared on the canonical `market:CODE` id, so `us:aapl` and `us:AAPL` are one
entry, as are `hk:700` and `hk:00700`. Invalid entries never break the extension: they are skipped,
logged to the output channel, listed in the status bar tooltip with their validation message and
offered a **Remove** link that deletes that raw entry from the settings.

Validation messages, asserted in `src/test/symbols.test.ts`:

| Input | Message |
| --- | --- |
| `600519` | Missing market prefix. Use cn:600519, us:AAPL or crypto:BTCUSDT. |
| `jp:7203` | Unsupported market "jp". Available markets: cn, hk, us, crypto. |
| `cn:6005` | China A-share codes must be 6 digits, for example cn:600519. |
| `hk:123456` | Hong Kong codes are up to 5 digits, for example hk:00700. |
| `us:123` | US tickers look like us:AAPL or us:BRK.B. |
| `crypto:B` | Crypto pairs look like crypto:BTCUSDT. |
| `cn:700001` | Cannot infer the exchange for code "700001". |

## Commands

| Command | Behaviour |
| --- | --- |
| `codingview.addSymbol` | Input box with live validation, then appends to the watchlist |
| `codingview.removeSymbol` | Quick pick of current entries, then removes the selection |
| `codingview.refreshNow` | Schedules an immediate refresh |
| `codingview.showList` | Quick pick of every symbol with its quote; picking one rotates to it |
| `codingview.nextSymbol` | Advances the rotation |
| `codingview.pinSymbol` | Prompts for the pinned symbol; an empty answer unpins |
| `codingview.removeSymbolEntry` | Removes one raw watchlist entry; invoked from the tooltip's **Remove** link, not from the palette |

## Settings

| Setting | Type | Default | Constraint |
| --- | --- | --- | --- |
| `codingview.watchlist` | `string[]` | `[]` | Entries use the grammar above |
| `codingview.refreshIntervalSeconds` | number | `60` | Minimum 15 |
| `codingview.rotateIntervalSeconds` | number | `5` | Minimum 2 |
| `codingview.requestTimeoutSeconds` | number | `8` | Minimum 2, maximum 60 |
| `codingview.colorByDirection` | boolean | `true` | Green up, red down |
| `codingview.provider` | string | `auto` | `auto`, `tencent`, `sina`, `binance-vision` |
| `codingview.pinnedSymbol` | string | `''` | One entry that never rotates; empty means unpinned |

All settings use `scope: window`, so a folder can override the list for one workspace.
`codingview.provider: auto` walks Tencent, then Sina, then Binance Vision; a pinned id restricts
the cycle to that provider (an unknown id silently falls back to `auto`).

## Where the watchlist is written

`writeWatchlist()` inspects the setting first: if a workspace override exists, the command updates
`ConfigurationTarget.Workspace`, otherwise `ConfigurationTarget.Global`. Commands therefore never
create a surprising override, and hand-edited values survive.

## Localisation

| File | Scope |
| --- | --- |
| `package.nls.json` / `package.nls.zh-cn.json` | Contributed strings: command titles and setting descriptions |
| `l10n/bundle.l10n.zh-cn.json` | Runtime messages passed through `vscode.l10n.t` |

English is the default language, so `src/symbols.ts` and `src/format.ts` keep English defaults and
accept injected labels; `statusBar.ts` supplies the localised strings. Add new user-facing text to
both the source string and the zh-cn bundle, or the translation silently falls back to English.
