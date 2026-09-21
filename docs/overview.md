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
- An optional pinned item next to the rotation for one symbol that should never scroll away.
- A refresh button beside the prices, hidden while the watchlist has nothing to fetch.
- Optional `quantity` and `cost` per entry, giving profit and loss in the status bar and tooltip.
- Markets: mainland China A-shares, Hong Kong stocks, US stocks and crypto spot pairs.
- Keyless quote sources: Tencent (preferred), Sina (fallback), Binance Vision and Gate.io for crypto, plus an optional
  keyed Finnhub provider for US symbols.
- Refresh every 60 seconds with exponential backoff; stale prices stay visible.

## Non-goals for v1

- No webview, charts or sidebar tree view.
- No accounts or telemetry. The only optional key is Finnhub, and it lives in `SecretStorage`.
- No Visual Studio Marketplace publication: releases are GitHub Release assets, installed with
  `code --install-extension`.

## User stories

1. Add `cn:600519` from the command palette and watch it rotate in the status bar.
2. Track a mixed list (`us:AAPL`, `crypto:BTCUSDT`) and read every price from the tooltip.
3. Lose network access, keep the last known price and see it marked as stale.
4. Remove a symbol without hand-editing JSON.

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| Empty watchlist shows a clickable "Add a symbol" item | Verified in the extension host: `npm run test:smoke` asserts the placeholder text |
| Adding `cn:600519` shows a price within seconds | Verified live: `npm run verify:live` resolves one symbol per market from the real endpoints |
| Rotation advances every 5s and honours the setting | Implemented; exercised by the smoke test with `rotateIntervalSeconds: 2`, still worth an F5 pass for feel |
| Failed refresh keeps the last price and shows `$(warning)` only on the affected symbol | Verified by unit tests over mixed outcomes and an extension-host assertion that an unserved symbol alone is marked |
| Halted instruments are distinguishable from unknown codes | Verified by unit tests over the synthetic halted row and the unknown-code stub |
| `npm run lint && npm test` pass | Verified: ESLint clean, all Vitest specs green |
| `npm run test:smoke` passes | Verified: 8 assertions in a real VS Code 1.138 extension host |
| `npm run package` produces an installable `.vsix` | Verified: 11 entries including the bundle and the new media |
