# Roadmap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every milestone listed in `docs/roadmap.md` — both the "Limitations today" and
the "Candidate follow-ups" table — so the roadmap can be rewritten as shipped work.

**Architecture:** Keep the existing one-way layering (UI → orchestration → providers → HTTP). New
behaviour lands in the pure modules (`symbols.ts`, `format.ts`, `quoteService.ts`, `holdings.ts`,
`providers/*`) with Vitest coverage, and the `vscode`-facing layer (`statusBar.ts`, `watchlist.ts`,
`extension.ts`) stays thin and is verified by `tsc` plus the new extension-host smoke test.

**Tech Stack:** TypeScript strict mode, esbuild bundling, Vitest, `@vscode/vsce`,
`@vscode/test-electron` + Mocha for the smoke test, GitHub Actions CI.

**Spec:** `docs/roadmap.md` (limitations + candidate follow-ups), constrained by
`docs/architecture.md`, `docs/decisions.md` and `AGENTS.md`.

## Global Constraints

- Two-space indentation, semicolons, single quotes, trailing newline, no `any`.
- Only `extension.ts`, `statusBar.ts` and `watchlist.ts` may import `vscode`.
- Providers stay keyless by default and behind `QuoteProvider`; fixtures live in
  `src/test/fixtures/` and Tencent/Sina payloads are decoded with `TextDecoder('gbk')`.
- Every new user-facing string goes into both the source and `l10n/bundle.l10n.zh-cn.json`
  (runtime) or `package.nls*.json` (contributed).
- New settings use `scope: window`; secrets never touch settings JSON.
- `npm run lint && npm test && npm run compile` must pass before every commit that touches code.
- Never commit `dist/`, `node_modules/` or `*.vsix`.

---

### Task 1: Configurable request timeout

**Files:**
- Modify: `package.json` (new `codingview.requestTimeoutSeconds` property)
- Modify: `package.nls.json`, `package.nls.zh-cn.json`
- Modify: `src/statusBar.ts` (pass `timeoutMs` from settings)
- Test: `src/test/quoteService.test.ts`
- Docs: `docs/configuration.md`, `docs/architecture.md`, `README.md`

**Interfaces:**
- Produces: `QuoteServiceOptions.timeoutMs` (already exists) is now fed from
  `readSeconds('requestTimeoutSeconds', 8, 2) * 1000`.

- [ ] **Step 1: Write the failing test** — custom `timeoutMs` aborts a hanging provider and the
  fallback provider still answers (mirrors the existing 8 s timeout test with `timeoutMs: 50`).
- [ ] **Step 2: Run `npx vitest run src/test/quoteService.test.ts`** — the new assertion fails or
  passes for the wrong reason before the wiring exists.
- [ ] **Step 3: Add the setting** to `package.json` (number, default `8`, minimum `2`, maximum `60`,
  `scope: window`) plus both NLS bundles, and read it in `statusBar.ts`.
- [ ] **Step 4: Run `npm run lint && npm test && npm run compile`.**
- [ ] **Step 5: Update docs** (`configuration.md` settings table, `architecture.md` refresh cycle,
  `README.md` settings table) and commit.

### Task 2: Provider circuit breaker

**Files:**
- Modify: `src/quoteService.ts` (new `ProviderHealth`), `src/statusBar.ts`
- Test: `src/test/quoteService.test.ts`
- Docs: `docs/architecture.md`, `docs/data-sources.md`, `docs/decisions.md`

**Interfaces:**
- Produces: `class ProviderHealth { constructor(options?: { threshold?: number; cooldownCycles?: number }); shouldTry(providerId: string): boolean; recordSuccess(providerId: string): void; recordFailure(providerId: string): void; beginCycle(): void }`
  - `beginCycle()` ticks the cooldown counters once per refresh.
  - After `threshold` (default 2) consecutive failures a provider is skipped for `cooldownCycles`
    (default 3) cycles, then tried again; any success resets it.
- Consumes: `QuoteServiceOptions.health?: ProviderHealth`.
- `StatusBarController` owns one `ProviderHealth` instance for the lifetime of the item.

- [ ] **Step 1: Write the failing tests** — (a) a provider that always throws is skipped after the
  threshold and is not called again inside the cooldown window; (b) it is retried once the cooldown
  elapses; (c) a success resets the counter.
- [ ] **Step 2: Run the spec, watch it fail.**
- [ ] **Step 3: Implement `ProviderHealth`** and wire it through `QuoteService.candidates()` /
  `refresh()`; controller passes a shared instance and logs when a provider is skipped.
- [ ] **Step 4: Run `npm run lint && npm test && npm run compile`.**
- [ ] **Step 5: Update docs and commit** — this closes the "hanging provider costs one timeout per
  cycle" limitation together with Task 1.

### Task 3: Hong Kong market

**Files:**
- Modify: `src/providers/types.ts` (`Market` union), `src/symbols.ts`, `src/providers/tencent.ts`,
  `src/providers/sina.ts`, `package.json` + NLS (`config.watchlist` copy), `README.md`
- Create: `src/test/fixtures/tencent-hk.txt`, `src/test/fixtures/sina-hk.txt`
- Test: `src/test/symbols.test.ts`, `src/test/providers.tencent.test.ts`, `src/test/providers.sina.test.ts`
- Docs: `docs/configuration.md`, `docs/data-sources.md`, `docs/overview.md`, `docs/decisions.md`

**Interfaces:**
- `Market = 'cn' | 'us' | 'crypto' | 'hk'`.
- `parseInstrument('hk:700')` → `{ id: 'hk:00700', market: 'hk', code: '00700' }` (5-digit, zero padded).
- `tencentSymbol({ market: 'hk', code: '00700' })` → `hk00700`; `sinaSymbol(...)` → `rt_hk00700`.
- Tencent HK rows reuse the A-share layout (`fields[3]` price, `fields[4]` prev close, `fields[30]`
  time, `fields[31]` change, `fields[32]` percent) and report `HKD`.
- Sina HK rows are `nameEn,nameCn,open,prevClose,high,low,price,change,changePercent,…,date,time`.

- [ ] **Step 1: Capture the real fixtures** from `qt.gtimg.cn/q=hk00700,hk09988,hk01810` and
  `hq.sinajs.cn/list=rt_hk00700,…` (already fetched during planning).
- [ ] **Step 2–4: TDD** — failing tests for grammar/padding/symbol building, then the parser tests,
  then the implementation.
- [ ] **Step 5–6: Update the `hk:00700` rejection table row, docs and commit.**

### Task 4: Halted instruments are distinguishable

**Files:**
- Modify: `src/providers/types.ts` (`Quote.halted?`), `src/providers/tencent.ts`,
  `src/providers/sina.ts`, `src/format.ts`, `src/statusBar.ts`, `l10n/bundle.l10n.zh-cn.json`
- Create: `src/test/fixtures/tencent-halted-synthetic.txt`
- Test: `src/test/providers.tencent.test.ts`, `src/test/providers.sina.test.ts`, `src/test/format.test.ts`
- Docs: `docs/data-sources.md`, `docs/architecture.md`, `docs/testing.md`

**Interfaces:**
- `Quote.halted?: boolean` — set when a row resolved but has no tradable price
  (`price === 0 && prevClose > 0`). Such a quote still resolves the instrument, so it never lands in
  `RefreshOutcome.missing`.
- `formatStatusBarText` renders `${code} -- (halted)` (localised label) and the tooltip change
  column shows "Halted" instead of a percent.

- [ ] **Step 1: TDD** — failing parser test: the zero-priced "Nasdaq Test Symbol" stub is dropped,
  a zero price with a non-zero previous close yields `halted: true`.
- [ ] **Step 2: Implement** in the parsers + `statusBarText` labels + tooltip row.
- [ ] **Step 3: Run `npm run lint && npm test && npm run compile`, update docs, commit.**

### Task 5: Invalid-symbol feedback

**Files:**
- Modify: `src/format.ts` (`tooltipMarkdown` invalid section), `src/statusBar.ts`,
  `src/watchlist.ts` (`removeSymbolEntry`), `src/extension.ts`, `package.json` + NLS,
  `l10n/bundle.l10n.zh-cn.json`
- Test: `src/test/format.test.ts`
- Docs: `docs/configuration.md`, `docs/architecture.md`

**Interfaces:**
- `TooltipArgs.invalid?: readonly { entry: string; reason: string; removeLink: string }[]` and
  `TooltipLabels.invalidTitle`, `TooltipLabels.remove`.
- New command `codingview.removeSymbolEntry` taking a raw entry string; the markdown link is
  `command:codingview.removeSymbolEntry?%5B%22<encoded entry>%22%5D`.
- The tooltip `MarkdownString` sets `isTrusted = { enabledCommands: ['codingview.removeSymbolEntry'] }`.

- [ ] **Step 1: TDD** — failing `format.test.ts` case asserting the invalid section renders the
  entry, the reason and the command link.
- [ ] **Step 2: Implement** format + controller + command + NLS + docs.
- [ ] **Step 3: Run `npm run lint && npm test && npm run compile`, commit.**

### Task 6: Pinned second status bar item

**Files:**
- Modify: `package.json` + NLS (`codingview.pinnedSymbol`, `codingview.pinSymbol`), `src/statusBar.ts`,
  `src/watchlist.ts` (`pinSymbol`), `src/extension.ts`, `l10n/bundle.l10n.zh-cn.json`
- Test: covered by `npm run compile` + smoke test (VS Code layer)
- Docs: `docs/configuration.md`, `docs/architecture.md`, `docs/decisions.md`, `README.md`

**Interfaces:**
- Setting `codingview.pinnedSymbol: string` (default `''`); the pinned symbol is always fetched even
  when it is not in the watchlist and is excluded from the rotating list.
- Command `codingview.pinSymbol`: input box with the same validation as `addSymbol`, empty input
  clears the pin; writes `codingview.pinnedSymbol` in the user's scope.
- The pinned item is a second `StatusBarItem` (priority 101) that shows the quote or `--`.

- [ ] **Step 1: Implement the controller changes** (second item, rotation list, dispose).
- [ ] **Step 2: Add the setting, command, NLS, docs.**
- [ ] **Step 3: Run `npm run lint && npm test && npm run compile`, commit.**

### Task 7: Holdings and profit/loss

**Files:**
- Create: `src/holdings.ts`
- Modify: `src/symbols.ts` (`WatchlistEntry`, `parseWatchlist`), `src/format.ts` (money + P/L
  formatting), `src/statusBar.ts`, `src/watchlist.ts` (`setHolding`), `src/extension.ts`,
  `package.json` + NLS, `l10n/bundle.l10n.zh-cn.json`
- Test: `src/test/holdings.test.ts`, `src/test/symbols.test.ts`, `src/test/format.test.ts`
- Docs: `docs/configuration.md`, `docs/overview.md`, `docs/decisions.md`, `README.md`

**Interfaces:**
- `type WatchlistEntry = string | { symbol: string; quantity?: number; cost?: number }`.
- `parseWatchlist(entries)` additionally returns `holdings: ReadonlyMap<string, Holding>` where
  `Holding { id: string; quantity: number; cost: number }`.
- `profitLoss(quote, holding)` → `{ value: number; cost: number; profit: number; percent: number }`.
- `formatMoney(value, currency)` and `formatSignedMoney(value, currency)`.
- New command `codingview.setHolding` (pick a symbol, then quantity, then average cost).
- Status bar appends the profit for the current symbol when a holding exists; the tooltip gains a
  P/L column.

- [ ] **Step 1–3: TDD** `holdings.ts` and the entry parsing (string and object forms, invalid
  quantity/cost rejected into `invalid`).
- [ ] **Step 4: Wire the UI, NLS and docs.**
- [ ] **Step 5: Run `npm run lint && npm test && npm run compile`, commit.**

### Task 8: Keyed provider (Finnhub) and delay disclosure

**Files:**
- Create: `src/providers/finnhub.ts`, `src/test/fixtures/finnhub-quote.json`,
  `src/test/fixtures/finnhub-error.json`
- Modify: `src/providers/index.ts`, `src/extension.ts` (SecretStorage bootstrapping), `src/statusBar.ts`
  (delay note), `src/format.ts` (`TooltipArgs.notes`), `package.json` + NLS
  (`codingview.setApiKey`, `codingview.provider` enum), `src/test/*`
- Test: `src/test/providers.finnhub.test.ts`
- Docs: `docs/data-sources.md`, `docs/configuration.md`, `docs/decisions.md`, `README.md`

**Interfaces:**
- `createFinnhubProvider({ getApiKey, httpGet })` → id `finnhub`, `displayName` "Finnhub",
  `supports(market) === (market === 'us' && Boolean(getApiKey()))`.
- One `GET https://finnhub.io/api/v1/quote?symbol=<CODE>&token=<key>` per US instrument; parsing is a
  pure `parseFinnhubQuote(text, instrument)`.
- `SymbolRegistry`/`ApiKeyStore` in `extension.ts` caches `SecretStorage` values so `getApiKey` stays
  synchronous; command `codingview.setApiKey` writes through `SecretStorage`.
- Tooltip gains a note when a US quote is on screen: "US quotes may be delayed by the source."

- [ ] **Step 1–3: TDD** the pure parser (happy path, `{c:0}` empty quote, error payload).
- [ ] **Step 4: Wire the provider, secrets command, `coder` enum, NLS and docs.**
- [ ] **Step 5: Run `npm run lint && npm test && npm run compile`, commit.**

### Task 9: Extension-host smoke test and CI

**Files:**
- Create: `.vscode-test.mjs`, `test/smoke/extension.test.ts`, `.github/workflows/ci.yml`
- Modify: `package.json` (dev dependencies + `test:smoke` script), `.vscodeignore`, `tsconfig.json`
- Docs: `docs/testing.md`, `docs/release.md`, `AGENTS.md`

**Interfaces:**
- `npm run test:smoke` → `vscode-test --config .vscode-test.mjs` running Mocha specs from
  `out-test/smoke/**/*.test.js` against the bundled extension.
- The smoke test asserts: activation registers the five-plus commands, the empty watchlist renders
  the `Add a symbol` placeholder, and `codingview.addSymbol` exists in `contributes.commands`.
- CI runs `npm ci`, `npm run lint`, `npm test`, `npm run compile` and `xvfb-run -a npm run test:smoke`.

- [ ] **Step 1: Add the harness** and compile the smoke specs with a dedicated tsconfig.
- [ ] **Step 2: Run the smoke test locally** (downloads VS Code; needs the Electron runtime libs).
  If the sandbox cannot launch Electron, record that and rely on the CI job.
- [ ] **Step 3: Add the CI workflow, update `.vscodeignore`, docs and `AGENTS.md`, commit.**

### Task 10: Marketplace polish

**Files:**
- Create: `scripts/generate-screenshots.mjs`, `media/statusbar.png`, `media/rotation.gif`
- Modify: `README.md`, `package.json` (`publisher`, `repository`, `bugs`, version `0.2.0`),
  `CHANGELOG.md`, `docs/release.md`, `docs/roadmap.md`, `docs/overview.md`

**Interfaces:**
- `node scripts/generate-screenshots.mjs` regenerates both images from the real fixture values so the
  README assets stay in sync with the code.

- [ ] **Step 1: Write the renderer** (status bar mockup + 3-frame rotation GIF, pure Node PNG/GIF
  encoders like `scripts/generate-icon.mjs`).
- [ ] **Step 2: Rewrite the README** as a listing page with the screenshots, quick start, symbol
  table, settings, data sources, privacy and development sections.
- [ ] **Step 3: Replace the publisher/repository/bugs placeholders and bump the version; add the
  CHANGELOG entry.**
- [ ] **Step 4: Rewrite `docs/roadmap.md`** so shipped milestones move to a "Shipped" section, and
  update the acceptance-criteria table in `docs/overview.md`.
- [ ] **Step 5: Run the full verification** (`npm run lint && npm test && npm run compile &&
  npm run package`) and commit.

---

## Verification gates

| Gate | Command | Evidence |
| --- | --- | --- |
| Types + bundle | `npm run compile` | exit 0, bundle written |
| Lint | `npm run lint` | no findings |
| Unit suite | `npm test` | all specs pass |
| Packaging | `npm run package` | `.vsix` with `dist/extension.js` |
| Extension host | `npm run test:smoke` | activation + command registration assertions pass |
| Live providers | approved `curl` to `qt.gtimg.cn` / `hq.sinajs.cn` | HK fixtures and field mappings verified against real payloads |
