# Changelog

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
- README screenshots captured from a real window, and real publisher/repository metadata.

## 0.1.0

- Status bar item that rotates through the watchlist and shows price plus change percent.
- Watchlist stored in `codingview.watchlist` and managed with five commands.
- Quote providers: Tencent and Sina for A-shares and US stocks, Binance Vision for crypto.
- Auto failover from Tencent to Sina, request batching, timeouts and exponential backoff.
