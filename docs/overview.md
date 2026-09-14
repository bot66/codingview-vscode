# Overview

CodingView shows live stock and cryptocurrency quotes in a VS Code status bar item, so a
developer can follow their portfolio without leaving the editor.

- Audience: developers who already track positions in a broker or exchange app and want a
  glanceable ticker inside VS Code.
- Success: after installing the extension and adding one symbol, a current price and change
  percent are visible within seconds and stay fresh without further interaction.

## v1 scope

- One left-aligned status bar item rotating through the watchlist every 5 seconds.
- Watchlist stored in `codingview.watchlist`, managed by commands and editable by hand.
- Markets: mainland China A-shares, Hong Kong stocks, US stocks and crypto spot pairs.
- Keyless quote sources: Tencent (preferred), Sina (fallback) and Binance Vision.
- Refresh every 60 seconds with exponential backoff; stale prices stay visible.

## Non-goals for v1

- No holdings, cost basis or profit/loss tracking.
- No webview, charts or sidebar tree view.
- No API keys, accounts or telemetry.
- No CI pipeline.

## User stories

1. Add `cn:600519` from the command palette and watch it rotate in the status bar.
2. Track a mixed list (`us:AAPL`, `crypto:BTCUSDT`) and read every price from the tooltip.
3. Lose network access, keep the last known price and see it marked as stale.
4. Remove a symbol without hand-editing JSON.

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| Empty watchlist shows a clickable "Add a symbol" item | Implemented, pending an F5 run |
| Adding `cn:600519` shows a price within seconds | Implemented; provider path verified live |
| Rotation advances every 5s and honours the setting | Implemented, pending an F5 run |
| Failed refresh keeps the last price and shows `$(warning)` | Implemented; failover verified live |
| `npm run lint && npm test` pass | Verified: ESLint clean, 61 tests |
| `npm run package` produces an installable `.vsix` | Verified: 11 entries incl. the bundle |
