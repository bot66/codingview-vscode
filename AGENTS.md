# Repository Guidelines

`codingview-vscode` is a VS Code extension that displays live stock and
cryptocurrency prices in the bottom of the editor window, so developers can keep an
eye on their portfolio while they code. The primary surface is a status bar item
that refreshes periodically; symbols and refresh behavior are driven by extension
settings. The working tree is currently a scaffold (`.agents/`, `.codex/`, and
`.git/` only); create the directories below as code lands.

## Project Structure & Module Organization

- `src/` — extension source in TypeScript; activation entry point `src/extension.ts`.
- `src/test/` — unit and integration tests, mirroring the `src/` layout.
- `media/` — icons, screenshots, and static assets referenced from `package.json`.
- `.agents/`, `.codex/` — local agent and tooling configuration; keep these committed.
- Root — `package.json` (contribution points and scripts), `tsconfig.json`,
  `eslint.config.mjs`.

## Build, Test, and Development Commands

- `npm install` — install dependencies.
- `npm run compile` — type-check and build the extension with `tsc`.
- `npm run watch` — incremental rebuild while developing.
- `npm run lint` — run ESLint across `src/`.
- `npm test` — run the suite through `@vscode/test-electron`.
- `F5` in VS Code — launch the Extension Development Host for manual checks.
- `npx vsce package` — produce a `.vsix` for local installation.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single quotes, and a trailing newline.
TypeScript runs in strict mode; avoid `any`. Name functions and variables in
`camelCase`, classes and types in `PascalCase`, and files in kebab-case. Prefix
every command ID with `codingview.` (for example `codingview.openFile`). Run
`npm run lint` before committing.

## Testing Guidelines

Tests use Mocha with `@vscode/test-electron`; name files `*.test.ts` and keep them
under `src/test/`. Cover each command handler and the activation path, including
at least one failure case per feature. Run `npm test` locally; the suite must pass
before merge.

## Commit & Pull Request Guidelines

No commit history exists yet, so follow Conventional Commits: `feat(editor): add
diff view` or `fix: handle empty workspace`. Write the subject in the imperative
mood and keep it under 72 characters. Pull requests should explain the change,
link the related issue, list manual verification steps, and include screenshots or
a short GIF for any UI change.

## Agent-Specific Instructions

Never overwrite this file. Keep edits scoped to `src/` and tests, leave `.agents/`
and `.codex/` configuration intact, and run `npm run lint && npm test` before
reporting work as complete.
