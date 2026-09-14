# Data sources

## Sources in use

| Provider id | Markets | Auth | Endpoint |
| --- | --- | --- | --- |
| `tencent` | A-shares, US | none | `https://qt.gtimg.cn/q=<symbols>` |
| `sina` | A-shares, US | none | `https://hq.sinajs.cn/list=<symbols>` |
| `binance-vision` | crypto | none | `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=[…]` |

Tencent is preferred; Sina covers the same markets and is used when Tencent fails or resolves
nothing for a symbol. Crypto never reaches the stock providers.

## Symbol translation

| User entry | Tencent | Sina |
| --- | --- | --- |
| `cn:600519` | `sh600519` | `sh600519` |
| `cn:000001` | `sz000001` | `sz000001` |
| `cn:920002` | `bj920002` | `bj920002` |
| `hk:00700` | `hk00700` | `rt_hk00700` |
| `us:AAPL` | `usAAPL` | `gb_aapl` |
| `crypto:BTCUSDT` | not supported | not supported |

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
emitting a quote. A halted instrument that reports 0 is therefore indistinguishable from an
unknown code and shows `--`.

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
| CoinGecko, OKX, Coinbase, Kraken, Eastmoney | Unreachable from the development sandbox, so not adopted. |
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
