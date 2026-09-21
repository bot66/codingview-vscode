# Changelog

## 0.4.0

- A green refresh button now sits immediately to the right of the status bar prices. Click it to
  fetch fresh quotes without opening the Command Palette; the icon spins while the request is
  active.

## 0.3.1

- Documentation, agent notes, CI workflows, scripts and tests no longer cut a release: a version is
  required only when a change can reach the `.vsix`, so a docs edit stops burning a version number
  and publishing an empty GitHub Release. `npm run check:version` compares the diff against the
  released tag and only asks for a bump when shipped paths moved.

## 0.3.0

- Crypto symbols can name their source: `crypto:gate:LITUSDT`, which is how two coins sharing a
  ticker stay apart. Unqualified entries keep resolving through Binance as before.
- Second crypto source: keyless Gate.io, tried after Binance Vision for unqualified pairs.
- **CodingView: Search Crypto** finds a coin by name or ticker and shows its name, contract address
  and live price before adding it as `crypto:gate:<PAIR>`.
- Binance batch errors no longer drop every crypto quote: an unknown symbol is isolated by retrying
  the batch one symbol at a time, so the rest keep pricing.
- One version per change: `npm run version:bump` moves the manifest, the lockfile and the changelog
  together, and `npm run check:version` fails CI when a change reuses a released version or leaves
  the three files out of step.
- Upgrading from 0.2.0 needs one manual step: uninstall the old `tgc.codingview` build first. Its
  publisher id changed to `bot66`, so VS Code keeps both enabled, the duplicate command
  registration aborts activation and the new commands look missing.
- Crypto codes are no longer limited to ASCII, because Gate lists coins whose ticker is not:
  `牛来_USDT`, `KFC!3`, `SKM-CDY`. Picking one of them used to fail with a symbol error after the
  search had already found it.
- Gate pairs are written the Binance way everywhere: `crypto:gate:LITUSDT` and `Lighter LITUSDT
  4.2140`, not `LIT_USDT`. The old spelling still parses to the same entry, and a base code that
  contains an underscore (`LITE_OLD_USDT`) keeps it.

## 0.2.0

- Hong Kong listings (`hk:00700`) through the existing Tencent and Sina endpoints.
- A pinned symbol in its own status bar item, next to the rotation.
- Holdings: `quantity` and `cost` per watchlist entry, with profit and loss in the status bar and a
  `P/L` column in the tooltip.
- Optional keyed US source: **CodingView: Set API Key** stores a Finnhub key in `SecretStorage`.
- Suspended instruments render as `Halted` instead of being confused with unknown codes.
- Status bar labels read `name code price change`; crypto pairs use the base asset as the name, so
  `crypto:BTCUSDT` reads `BTC BTCUSDT`.
- Ignored entries are listed in the tooltip with a **Remove** link.
- Configurable request timeout, plus a circuit breaker that skips a source failing twice in a row.
- US delay disclosure in the tooltip.
- Extension-host smoke test and a GitHub Actions workflow.
- README screenshots captured from a real window, and repository metadata that points at this
  project.
- Tag-driven release workflow: `v*` tags verify, test and package the extension, then attach the
  `.vsix` to a GitHub Release with these notes. The project is not published to the Visual Studio
  Marketplace.

## 0.1.0

- Status bar item that rotates through the watchlist and shows price plus change percent.
- Watchlist stored in `codingview.watchlist` and managed with five commands.
- Quote providers: Tencent and Sina for A-shares and US stocks, Binance Vision for crypto.
- Auto failover from Tencent to Sina, request batching, timeouts and exponential backoff.
