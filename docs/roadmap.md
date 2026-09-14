# Roadmap and known limitations

## Limitations today

- **A hanging provider costs one timeout per cycle.** When `qt.gtimg.cn` is unreachable, each cycle
  waits out the 8 s timeout before Sina answers (observed in the development sandbox). Prices still
  update, but the cycle is slower than it needs to be.
- **Invalid symbols linger.** They keep rendering `--` and are only explained in the output channel;
  there is no prompt to remove or correct them.
- **US quotes may be delayed** depending on the upstream endpoint, and the UI does not say so.
- **Halted instruments are indistinguishable from unknown codes**, because both arrive as a zero
  price and the parser drops them.
- **Single item only.** There is no way to pin one symbol permanently or show two at once.
- **No Hong Kong market** even though both stock endpoints support `hk00700`.
- **No end-to-end coverage** of activation, the status bar or settings writes.
- **Placeholders remain**: `publisher`, `repository.url` and `bugs.url`, plus missing screenshots.

## Candidate follow-ups

| Candidate | Notes |
| --- | --- |
| Provider circuit breaker | After N consecutive failures, skip a provider for a few cycles so the failover does not pay the timeout every minute. |
| Configurable request timeout | Add a setting (or raise the 8 s default) if slower networks show up in reports. |
| Hong Kong support | Extend the market union, the prefix rules (`hk` → `hk` prefix) and the provider symbol builders, then add fixtures. |
| Keyed provider (Finnhub, Twelve Data) | Behind the existing `QuoteProvider` interface with the key in `SecretStorage`; improves US reliability and delay transparency. |
| Holdings and profit/loss | Requires cost basis and quantity per entry, so it changes the settings schema (objects instead of strings) and needs its own formatting and tests. |
| Invalid-symbol feedback | Mark the offending rows in the status bar tooltip and offer "remove this symbol" as a command link. |
| Two status bar items | Let users pin one symbol next to the rotating one. |
| Extension-host smoke test | `@vscode/test-electron` to cover activation, command registration and the empty-watchlist placeholder. |
| CI workflow | Run `npm run lint && npm test && npm run compile` on pull requests. |
| Marketplace polish | Screenshots, a GIF of the rotation and a shorter README aimed at listing visitors. |
