# Data sources

## Sources in use

| Provider id | Markets | Auth | Endpoint |
| --- | --- | --- | --- |
| `finnhub` | US | API key in `SecretStorage` | `https://finnhub.io/api/v1/quote?symbol=<CODE>` |
| `tencent` | A-shares, Hong Kong, US | none | `https://qt.gtimg.cn/q=<symbols>` |
| `sina` | A-shares, Hong Kong, US | none | `https://hq.sinajs.cn/list=<symbols>` |
| `binance-vision` | crypto | none | `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=[…]` |
| `gate` | crypto | none | `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=<PAIR>` |

Finnhub leads for US symbols, but only once a key is stored; without one it reports that it does not
support any market, so a fresh install stays keyless. Tencent is then preferred for stocks, Sina
covers the same markets and is used when Tencent fails or resolves nothing for a symbol, and crypto
never reaches the stock providers. Crypto has two sources: Binance Vision first, then Gate, which
also serves the pairs a user pinned with `crypto:gate:<PAIR>`.

## Symbol translation

| User entry | Tencent | Sina |
| --- | --- | --- |
| `cn:600519` | `sh600519` | `sh600519` |
| `cn:000001` | `sz000001` | `sz000001` |
| `cn:920002` | `bj920002` | `bj920002` |
| `hk:00700` | `hk00700` | `rt_hk00700` |
| `us:AAPL` | `usAAPL` | `gb_aapl` |
| `crypto:BTCUSDT` | not supported | not supported |
| `crypto:gate:LITUSDT` | not supported | not supported |

Prefix rules for A-shares: `900xxx` → `sh` (Shanghai B-shares), `5`/`6` → `sh`, `9xxxxx` → `bj`,
`43`/`83`/`87` → `bj`, `0`–`3` → `sz`, anything else (for example `700001`) is rejected. The
`900xxx` check must stay ahead of the generic `9` rule.

## Tencent

One request carries every stock symbol: `q=sh600519,sz000001,usAAPL` was verified to work in a
single call. The response is GBK text with one row per symbol:

```
v_sh600519="1~贵州茅台~600519~1277.96~1275.16~1277.27~…~20260914161450~2.80~0.22~1285.53~1270.36~…";
```

| Index | Field | Use |
| --- | --- | --- |
| 1 | name | Tooltip |
| 3 | last price | Required; rows with 0 are dropped |
| 4 | previous close | Required; rows with 0 are dropped |
| 30 | timestamp | `asOf` — `20260914161450` for A-shares, `2026-09-14 10:33:20` for US |
| 31 | change | Absolute change |
| 32 | change percent | Status bar |
| 35 | currency | US only; A-shares are hard-coded `CNY` and Hong Kong `HKD` |

Unknown codes are not an HTTP error: the endpoint answers with a zero-priced stub (for example
`Nasdaq Test Symbol`), which is why the parser requires `price > 0` and `prevClose > 0` before
emitting a quote.

A halted instrument reports `0.000` as well, but it keeps a real previous close. The parser uses
that difference: no previous close means the code is unknown and the row is dropped, a previous
close without a price means the instrument is suspended, and it is emitted as a quote with
`halted: true`, `price: 0` and no change. The status bar then reads `600519 -- 停牌` (or `Halted`
in English) instead of pretending the instrument does not exist. The heuristic is asserted by
`src/test/fixtures/tencent-halted-synthetic.txt`, the real row with the price fields zeroed.

Hong Kong rows (`hk00700`) keep the same field layout — index 3 is the price, 4 the previous close,
30 the timestamp (`2026/09/14 16:08:10`), 31/32 the change and the change percent — and report the
currency as `HKD`. Unlike US tickers, an unknown Hong Kong code comes back as no row at all instead
of a zero-priced stub.

## Sina

Two differences from Tencent: the endpoint answers 403 without `Referer: https://finance.sina.com.cn/`,
and US tickers use a different field layout.

A-shares (`sh`/`sz`/`bj` prefix, comma separated in `list=`):

| Index | Field |
| --- | --- |
| 0 | name |
| 1 | open |
| 2 | previous close |
| 3 | last price |
| 30 / 31 | date / time |

US tickers use the order `name, price, changePercent, timestamp, change`, so `prevClose` is derived
as `price - change`. For A-shares, `change` and `changePercent` are derived from `price - prevClose`
because the endpoint does not report them. Derived values are rounded to 4 decimals to avoid float
noise such as `332.27000000000004`. Payloads without fields (for example
`var hq_str_sz399001=""`) are skipped.

Hong Kong rows use `rt_hk00700` and a third layout: English and Chinese names first, then
`open, prevClose, high, low, price, change, changePercent` (indexes 2–8), with the timestamp at
indexes 17 and 18 and the currency fixed to `HKD`. The tooltip shows the Chinese name when the
endpoint supplies one.

Sina follows the same rule for suspended instruments: a payload with a zero price but a real
previous close becomes a `halted: true` quote, and one with neither is skipped.

## Binance Vision

A batch request sends a URL-encoded JSON array:
`…/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D`. `api.binance.com` is unreachable on
some networks, so the public mirror `data-api.binance.vision` is used; it serves the same public
market data without a key or signature.

Fields used: `symbol`, `lastPrice`, `priceChange`, `priceChangePercent`, `prevClosePrice`. Errors
arrive as an object such as `{"code":-1121,"msg":"Invalid symbol."}` and are raised as a
`ProviderError`, which the service records before retrying the fallback provider. `currency` is
derived from the quote-asset suffix of the pair (`USDT`, `USDC`, `FDUSD`, `TUSD`, `BTC`, `ETH`,
`BNB`, `EUR`, `TRY`).

Crypto pairs have no display name, so the parser sets `name` to the base asset — `BTCUSDT` becomes
`BTC`, `ETHBTC` becomes `ETH` — by stripping the quote asset suffix, and the status bar then reads
`BTC BTCUSDT 78494.01 +1.73%` while the tooltip keeps `crypto:BTCUSDT` in its identifier column.

A batch request fails as a whole when one symbol is unknown (`{"code":-1121,"msg":"Invalid symbol."}`,
HTTP 400), so the provider retries the symbols one by one — at most five in flight — and keeps the
ones that resolve. Transport failures are never retried that way. See
[crypto-identity.md](crypto-identity.md) for why that matters to the Gate fallback.

## Gate.io

Gate covers the long tail of small listings, which is where two coins with the same ticker show up.
It is keyless and takes one pair per request: `?currency_pair=LIT_USDT`. Comma- or JSON-batched
pairs answer `{"label":"INVALID_CURRENCY_PAIR",…}` with HTTP 400.

Fields used from `GET /api/v4/spot/tickers`:

| Field | Use |
| --- | --- |
| `currency_pair` | Must equal the pair that was asked for, so a stray row cannot price another entry |
| `last` | Price; rows without a positive price are dropped |
| `change_percentage` | The change percent shown in the status bar |

`prevClose` and `change` are derived from the percent (`last / (1 + percent / 100)`, then
`last - prevClose`), rounded to four decimals like the Sina parser, because Gate publishes no
previous close.

`GET /api/v4/spot/currencies/<CODE>` adds the coin name and its contract (`LIT` → `Lighter`,
`ETH 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2`). Names are cached per currency for the session and
are best-effort: a failed lookup falls back to the base asset. An unknown currency or pair answers
HTTP 400 (`INVALID_CURRENCY`), which the provider reads as "this instrument stays unresolved" — it
never fails the whole batch for one bad pair.

The **CodingView: Search Crypto** command pulls `GET /api/v4/spot/currencies` (≈2.1 MB) together with
`GET /api/v4/spot/tickers` (≈542 KB) once per session, then ranks matches locally; that fetch is
aborted after 15 s so a stalled connection cannot leave the progress notification spinning. Both `LITE3L_USDT`
and `LITE_OLD_USDT` are real rows: the first proves that a placeholder chain (`invalid-LITE3L-…`) is
not a contract, the second that a pair split has to take the last underscore.

## Finnhub

US quotes only, and only when the user stored a key with **CodingView: Set API Key**. The key lives
in `vscode.SecretStorage` (never in `settings.json`) and travels in the `X-Finnhub-Token` header, so
it cannot leak through a request URL or an error message. There is no batch quote endpoint, so the
provider issues one request per symbol; the free tier allows 60 requests per minute, which covers a
50 symbol watchlist cycle.

The response is `{"c":261.74,"d":2.24,"dp":0.8652,"h":264.9,"l":259.5,"o":260.4,"pc":259.5,"t":1757847600}`:
`c` is the current price, `pc` the previous close, `d`/`dp` the change and change percent and `t` the
timestamp in seconds. `c: 0` means Finnhub cannot price the symbol, so the parser returns nothing
and the cycle falls through to Tencent and Sina. Errors arrive as `{"error":"Invalid API key."}`, and
a 401/403 is translated into a message that points at the command instead of echoing the URL.

## Network behaviour observed

- `qt.gtimg.cn` was intermittently unreachable from the development sandbox — a ~10.5 s connection
  timeout for both `curl` and Node's `fetch`. The 8 s request timeout fires first and Sina serves
  the quotes, so this exercises the failover path rather than an error path. In the latest run
  `curl` reached it in ~12 s while Node's `fetch` failed outright after ~15 s with `fetch failed`;
  the Tencent rows below are therefore captured with `curl` and asserted against fixtures.
- `hq.sinajs.cn` requires the `Referer` header. Node's global `fetch` forwards it (verified); it is
  not stripped the way a browser would.
- `query1.finance.yahoo.com` answered 429/403 during evaluation and is not used.

`ProviderHealth` remembers consecutive failures per provider across refresh cycles: two in a row
trips the circuit and the provider is skipped for the next three cycles before it is retried. That
keeps an unreachable `qt.gtimg.cn` from costing one request timeout every minute.

## Alternative sources evaluated

| Source | Result |
| --- | --- |
| Yahoo Finance | 429/403; now expects a crumb and cookie. Not adopted. |
| Finnhub | Reached, 401 without a key. Free tier: register at finnhub.io and copy the key from the dashboard (60 requests/minute). |
| CryptoCompare | Reached, 401 without a key; a free key is available. |
| CoinGecko | Best name search and no key for a handful of calls, but unreachable from the development sandbox, so no real fixture could back a parser. |
| DexScreener, OKX, Coinbase, Kraken, Bybit, KuCoin, Bitget, MEXC, HTX, Eastmoney | Unreachable from the development sandbox, so not adopted. |
| Gate.io | Reachable, keyless, and carries coin names and contract addresses; adopted as the second crypto source. |
| Stooq CSV | Reachable, but the documented URL answered 404 on the tested path. |

## Adding a source

1. Add `src/providers/<name>.ts` exporting `create<Name>Provider({ httpGet })` plus a pure
   `parse<Name>Response(text, bySymbol)`.
2. Implement `supports(market)` and `fetch(instruments, signal)`; return only resolvable quotes and
   throw on transport or payload failure.
3. Register it in `createDefaultProviders()` (`src/providers/index.ts`) — order is failover order, so
   append it unless the new source should take precedence for a market.
4. Add a real fixture under `src/test/fixtures/`, a spec beside the other provider specs, the
   provider id in this document, and — if users may pin it — in the `codingview.provider` enum.

Keyed providers fit the same interface: read the secret from `vscode.SecretStorage` (never from
settings JSON) and keep the parser pure so it stays unit testable.
