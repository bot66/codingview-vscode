# Repository Guidelines

`codingview-vscode` is a VS Code extension (engines `^1.90.0`) showing live stock and crypto
quotes in a status bar item, driven by `codingview.*` settings and keyless Tencent, Sina and
Binance Vision endpoints.

## Project Structure & Module Organization

- `src/extension.ts` — activation, command registration, status bar lifecycle.
- `src/statusBar.ts`, `src/watchlist.ts` — the VS Code facing layer; the only modules importing `vscode`.
- `src/symbols.ts`, `src/format.ts`, `src/quoteService.ts` — pure logic: symbols, formatting, batching, timeouts, backoff.
- `src/providers/` — one provider per source, behind the `QuoteProvider` interface in `types.ts`.
- `src/test/` — Vitest specs and real fixtures under `fixtures/`.
- `scripts/generate-icon.mjs` regenerates `media/icon.png`; `l10n/` holds the zh-cn strings.

## Build, Test, and Development Commands

- `npm run compile` — `tsc --noEmit`, then esbuild bundles `src/extension.ts` into `dist/extension.js`.
- `npm run watch` — incremental bundle; `F5` launches the Extension Development Host.
- `npm run lint` — run ESLint across `src/`.
- `npm test` / `npm run test:watch` — Vitest unit suite.
- `npm run package` — `vsce package --no-dependencies` (keep the flag: vsce's npm dependency probe returns an empty file list here).

## Coding Style & Naming Conventions

Two-space indentation, semicolons, single quotes, a trailing newline. TypeScript runs in strict
mode; avoid `any`. Files, functions and variables use `camelCase`, classes and types
`PascalCase`. Command IDs are `codingview.` plus camelCase (`codingview.addSymbol`). Keep
testable logic out of modules that import `vscode`.

## Testing Guidelines

Vitest runs in the node environment over `src/test/**/*.test.ts`. Fixtures are copied from real
responses; Tencent and Sina answer in GBK, so decode with `TextDecoder('gbk')`. Cover parsers,
exchange derivation, batching, timeouts, failover and backoff via an injected `httpGet` rather
than mocks. `statusBar.ts`, `watchlist.ts` and `extension.ts` are checked by `npm run compile`
plus a manual `F5` run.

## Commit & Pull Request Guidelines

Use Conventional Commits with a scope and an imperative subject under 72 characters, for
example `feat(statusbar): show live quotes`. PRs should state the change and motivation, link
the issue, list manual verification steps, and attach a screenshot or GIF for UI changes.

## Agent-Specific Instructions

- Update this file in place when structure, commands or conventions change; do not delete it.
- Add new sources behind `QuoteProvider`, keyless by default, backed by fixtures.
- Run `npm run lint && npm test` (plus `npm run compile` for the VS Code layer) before reporting completion; say which providers you exercised.
- Never commit `dist/`, `node_modules/` or `*.vsix`; `.gitignore` covers them.
