# Changelog

## 0.1.0

- Status bar item that rotates through the watchlist and shows price plus change percent.
- Watchlist stored in `codingview.watchlist` and managed with five commands.
- Quote providers: Tencent and Sina for A-shares and US stocks, Binance Vision for crypto.
- Auto failover from Tencent to Sina, request batching, timeouts and exponential backoff.
