# Repository Guidelines

`codingview-vscode` is a VS Code extension showing live stock and crypto quotes in a status bar
item, driven by `codingview.*` settings and keyless Tencent, Sina and Binance Vision endpoints.

## Project Structure & Module Organization

- `src/extension.ts` — activation, command registration, status bar lifecycle.
- `src/statusBar.ts`, `src/watchlist.ts` — the VS Code facing layer; the only modules importing `vscode`.
- `src/symbols.ts`, `src/format.ts`, `src/quoteService.ts`, `src/holdings.ts`, `src/settings.ts` — pure logic: symbols, formatting, holdings and profit/loss, batching, timeouts, backoff, setting defaults.
- `src/providers/` — one provider per source, behind the `QuoteProvider` interface in `types.ts`.
- `src/test/` — Vitest specs and real fixtures under `fixtures/`.
- `test/smoke/` — `@vscode/test-cli` specs that run in a real extension host (`npm run test:smoke`).
- `scripts/generate-icon.mjs` regenerates `media/icon.png`; `scripts/generate-screenshots.mjs`
  regenerates `media/statusbar.png` and `media/rotation.gif` from a real window; `scripts/verify-live.mjs`
  checks the real endpoints; `scripts/release-notes.mjs` prints the `CHANGELOG.md` section that
  becomes the GitHub Release notes; `l10n/` holds the zh-cn strings.
- `.github/workflows/ci.yml` gates every push and pull request; `.github/workflows/release.yml` turns
  a `v*` tag into a GitHub Release with the packaged `.vsix`.
- `docs/` — design documents; update the matching page when behaviour or commands change.

## Build, Test, and Development Commands

- `npm run compile` — `tsc --noEmit`, then esbuild bundles `src/extension.ts` into `dist/extension.js`.
- `npm run watch` — incremental bundle; `F5` launches the Extension Development Host.
- `npm run lint` — run ESLint across `src/`.
- `npm test` / `npm run test:watch` — Vitest unit suite.
- `npm run test:smoke` — compile and run the `@vscode/test-cli` suite in a real extension host.
- `npm run verify:live` — live check against the real quote endpoints for one symbol per market.
- `npm run package` — `vsce package --no-dependencies` (keep the flag: vsce's npm dependency probe returns an empty file list here).

## Coding Style & Naming Conventions

Two-space indentation, semicolons, single quotes, a trailing newline. TypeScript runs in strict
mode; avoid `any`. Files, functions and variables use `camelCase`, classes and types
`PascalCase`. Command IDs are `codingview.` plus camelCase (`codingview.addSymbol`). Keep
testable logic out of modules that import `vscode`.

## Testing Guidelines

Vitest runs over `src/test/**/*.test.ts`. Fixtures are real
responses; Tencent and Sina answer in GBK, so decode with `TextDecoder('gbk')`. Cover parsers,
exchange derivation, batching, timeouts, failover and backoff via an injected `httpGet` rather
than mocks. `statusBar.ts`, `watchlist.ts` and `extension.ts` are checked by `npm run compile`, the
extension-host smoke test and a manual `F5` run.

## Commit & Pull Request Guidelines

Use Conventional Commits with a scope and an imperative subject under 72 characters, for
example `feat(statusbar): show live quotes`. PRs should state the change and motivation, link
the issue, list manual verification steps, and attach a screenshot or GIF for UI changes.

## Agent-Specific Instructions

- Update this file in place when structure, commands or conventions change; do not delete it.
- Add new sources behind `QuoteProvider`, keyless by default, backed by fixtures.
- Run `npm run lint && npm test` (plus `npm run compile` for the VS Code layer) before reporting completion.
- Run `npm run test:smoke` after touching `statusBar.ts`, `extension.ts`, `watchlist.ts` or the manifest.
- Releases are GitHub Release assets cut from `v*` tags. Do not add Visual Studio Marketplace
  publishing steps (Azure DevOps organisation, PAT or Entra credentials): the project ships through
  GitHub Releases only, and `docs/decisions.md` records why.
- Never commit `dist/`, `node_modules/` or `*.vsix`; `.gitignore` covers them.
