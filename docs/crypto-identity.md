# Crypto identity: one ticker, several coins

## The problem

A ticker is only unique inside one exchange. Two different coins can both be called `LIT`, and the
watchlist used to accept exactly one shape for crypto — `crypto:<PAIR>` — which named a Binance
pair and nothing else. Captured live on 2026-09-16:

| Entry | Source | Price (24 h close) | What it is |
| --- | --- | --- | --- |
| `crypto:LITUSDT` | Binance Vision | `0.743` | the Binance listing that owns the `LITUSDT` ticker |
| `crypto:gate:LITUSDT` | Gate.io | `4.234` | Lighter, ETH contract `0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2` |

Same ticker, roughly six times the price, different assets. Nothing in `crypto:LITUSDT` says which of the
two the user meant, and the quote carries no name to notice the mistake with.

## Symbol grammar

Crypto entries accept an optional source between the market and the pair:

| Entry | Meaning |
| --- | --- |
| `crypto:BTCUSDT` | Unqualified: ask the crypto providers in failover order (Binance, then Gate) |
| `crypto:binance:BTCUSDT` | Binance Vision only |
| `crypto:gate:LITUSDT` | Gate.io only; `crypto:gate:LIT_USDT` is the same entry |

`binance` and `gate` are aliases for the provider ids `binance-vision` and `gate`, so provider
implementation names stay out of user configuration. The source is case-insensitive and stored
lower-case; the pair is upper-cased. The canonical id keeps both parts — `crypto:gate:LITUSDT` —
which is what the watchlist dedupes on, the tooltip's first column shows, and holdings are keyed by.
`crypto:LITUSDT` and `crypto:gate:LITUSDT` are therefore two entries, never one.

Gate separates base and quote with an underscore for its own API, but nothing else in the extension
does: the status bar reads `Lighter LITUSDT 4.2140 -0.40%`, not `LIT_USDT`. A qualified pair is
therefore stored the Binance way — `crypto:gate:LITUSDT` — and the provider puts the separator back
when it talks to Gate. Both spellings parse to that one id, so an older `crypto:gate:LIT_USDT` entry
keeps working and does not duplicate. Two cases keep the separator, because dropping it would name a
different coin: a base code that contains one (`LITE_OLD_USDT`) and a quote asset the extension does
not know (`FOO_DAI`). Unqualified pairs are never rewritten, since `crypto:LIT_USDT` and
`crypto:LITUSDT` are different instruments on Binance.

The pair pattern is 2–24 characters that are not whitespace, `:`, `/` or `\`; everything else is
allowed because Gate's ticker codes are wilder than ASCII: `牛来_USDT`, `KFC!3` and `SKM-CDY` are
real listings, and an ASCII-only pattern made the search command fail for the first of them. The
underscore matters too: Gate pairs are `<BASE>_<QUOTE>`, and `LITE_OLD_USDT` (a real delisted pair)
shows why the split takes the **last** underscore rather than the first.

## Routing and failover

`QuoteProvider.handles(instrument)` decides who is asked, and `QuoteService` builds each provider's
batch from it:

| Provider | Accepts |
| --- | --- |
| `binance-vision` | `crypto:*`, unqualified or `source === 'binance'` |
| `gate` | `crypto:*`, unqualified or `source === 'gate'` |

Consequences that the tests pin down:

- An unqualified pair goes to Binance first and only reaches Gate when Binance resolved nothing for
  it. Gate rewrites `BTCUSDT` into `BTC_USDT` using the shared quote-asset list before asking.
- A `crypto:gate:` pair never enters the Binance batch. This is not only tidiness: Binance answers an
  *invalid symbol* with a 400 for the whole batch, so leaking one Gate-only pair into it would push
  every other crypto quote through the fallback.
- A provider with an empty handled batch is skipped **without** recording a failure, so a watchlist
  of Gate-only pairs cannot trip the Binance circuit breaker.
- When Binance still fails a batch (one unknown symbol among known ones), it retries the symbols one
  by one, at most five in flight, and keeps the ones that resolve. Transport failures are not
  retried — they fail the provider for that cycle and the circuit breaker takes over.

## Finding a coin: **CodingView: Search Crypto**

`codingview.searchCrypto` is the answer to "I do not know what to type". It prompts for a name or a
ticker, asks Gate, and shows candidates:

```
Lighter (LIT)        4.2340 USDT -3.11%
ETH 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2 · crypto:gate:LITUSDT
```

Ranking (pure logic in `src/cryptoSearch.ts`, unit tested):

1. exact ticker (`LIT` for `lit`)
2. ticker prefix (`LITE3L`)
3. name prefix (`Bitcoin` for `bitcoin`)
4. name substring

Ties break alphabetically by ticker, the list is capped at 25, and a coin is only offered when it has
a live `<CODE>_USDT` market and is neither delisted nor trade-disabled — a candidate that cannot be
priced would only produce a `--` in the status bar. The contract address is included when Gate
publishes one, which is the final disambiguator between two coins of the same name; exchange-only
rows simply omit it. Picking a candidate writes `crypto:gate:<PAIR>` through the same de-dup and
write path as **Add Symbol**.

## Gate as a source

`src/providers/gate.ts` holds everything Gate-specific.

| Call | Use |
| --- | --- |
| `GET /api/v4/spot/tickers?currency_pair=<PAIR>` | One pair per request — Gate rejects comma- or JSON-batched pairs with `INVALID_CURRENCY_PAIR` — carrying `last` and `change_percentage` |
| `GET /api/v4/spot/currencies/<CODE>` | Coin name and contract, cached per currency for the session |
| `GET /api/v4/spot/currencies` + `GET /api/v4/spot/tickers` | The search catalogue (≈2.1 MB + ≈542 KB), fetched lazily and cached for the session |

Details worth knowing before changing the parser:

- The search catalogue carries its own 15 s abort, because the quote cycle's timeout does not cover
  an explicit command.
- Gate reports a change percent but no previous close, so `prevClose` is derived as
  `last / (1 + percent / 100)` and `change` as `last - prevClose`, both rounded to four decimals like
  the Sina parser. The percent itself is used as sent.
- A pair that does not exist answers HTTP 400 `{"label":"INVALID_CURRENCY",…}`; the provider treats
  400/404 as "this instrument stays unresolved" and lets every other pair answer. Any other failure
  (timeout, transport) still fails the provider so the circuit breaker sees it.
- Names are best-effort: a failed name lookup falls back to the base asset instead of failing quotes.
- The Binance and Gate providers share the quote-asset list in `src/symbols.ts`, so
  `splitCryptoPair('BTCUSDT')` and Gate's `BTC_USDT` cannot drift apart.

## Rejected alternatives

| Idea | Why not |
| --- | --- |
| Contract address as the identity: `crypto:eth:0x232c…` | Unambiguous and exchange-independent, but unreadable in `settings.json`, and every provider would need an address → pair resolver that Gate's public API does not offer |
| CoinGecko ids (`crypto:coingecko:lighter`) | Best name search and the widest coverage, but `api.coingecko.com` was unreachable from the development sandbox, so no real fixture could back the parser, and the free tier is rate-limited |
| User-defined aliases in settings (`lighter` → `gate:LITUSDT`) | Pushes the whole problem back to the user: they still have to know which exchange lists the coin and how that exchange spells the pair |
| Leaving unqualified pairs Binance-only | The coin the user actually bought stays unavailable unless they happen to know the exchange, which is the bug this page exists for |

## Known limitations

- Binance Vision publishes no coin names, so an unqualified Binance quote is still labelled with its
  base asset (`LIT LITUSDT`). Only Gate quotes carry a real name; that is one more reason to reach
  for the search command when a ticker is ambiguous.
- Only `<CODE>_USDT` markets are searched, so a coin with no USDT pair on Gate cannot be added from
  the picker.
- Reachability of `api.gateio.ws` varies by network (it was reachable from the development sandbox
  while `api.coingecko.com`, `api.dexscreener.com`, `api.bybit.com`, `www.okx.com`,
  `api.kucoin.com`, `api.bitget.com`, `api.mexc.com` and `api.kraken.com` were not). If Gate is
  unreachable, `crypto:gate:` entries and the search command degrade; unqualified pairs keep
  working through Binance.
