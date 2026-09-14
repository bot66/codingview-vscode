# Build and release

## Pipeline

| Script | Does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm run compile` | typecheck, then esbuild bundles `src/extension.ts` into `dist/extension.js` |
| `npm run watch` | unbundled, unminified rebuild loop for debugging (`F5`) |
| `npm run lint` | ESLint 9 flat config with typescript-eslint over `src/` |
| `npm test` | Vitest unit suite |
| `npm run package` | `vsce package --no-dependencies` |
| `npm run test:smoke` | compiles `test/smoke` and runs the extension-host suite (`xvfb-run` on Linux) |

esbuild emits CommonJS for Node 18 with `vscode` marked external, minifies for builds, keeps a
source map, and inlines every other dependency — so the `.vsix` needs no `node_modules`.

## Packaging notes

`vsce package` must keep the `--no-dependencies` flag. Without it, vsce probes npm for production
dependencies, which yields an empty file list in this environment, and packaging fails with
`Extension entrypoint(s) missing`. The bug reproduces with a ten-line throwaway extension, so it is
not caused by this repository's configuration; the flag is also semantically right because all
runtime code is bundled.

`.vscodeignore` keeps sources, tests, scripts, design docs, agent config and build config out of the
package. A successful run packs eleven entries: `extension.vsixmanifest`, `[Content_Types].xml`, the
manifest, `dist/extension.js`, `media/icon.png`, `l10n/`, the NLS bundles, `LICENSE.txt`,
`changelog.md` and `readme.md`.

## Publishing to the Marketplace

Prerequisites, all of which are user-owned accounts:

1. An Azure DevOps organisation and a Personal Access Token with **Marketplace → Manage** scope.
2. A publisher id created at the Marketplace management portal; `publisher` in `package.json` must
   match it. The repository currently ships `tgc`, which is the name this project was developed
   under — change it if the Marketplace publisher id differs.
3. `repository.url` and `bugs.url` point at `github.com/tgc/codingview-vscode`; adjust both if the
   project lives somewhere else, because the Marketplace listing links to them.

Then:

```bash
npx vsce login <publisher-id>   # paste the PAT
npm run package                 # sanity check the .vsix first
npx vsce publish patch          # or minor / major
```

`vsce publish` recompiles through `vscode:prepublish`, bumps the version, pushes a git tag and
uploads. Keep `CHANGELOG.md` current — it becomes the release notes.

## Listing requirements

| Asset | Requirement |
| --- | --- |
| `media/icon.png` | 128×128 PNG, referenced by `icon`; regenerate with `node scripts/generate-icon.mjs` |
| `README.md` | Becomes the listing page; keep the table of settings accurate |
| `LICENSE` | MIT; vsce repackages it as `LICENSE.txt` |
| `CHANGELOG.md` | Per-release notes |
| `engines.vscode` | `^1.90.0`; raise it deliberately, it gates installation for older editors |

Screenshots or a short GIF of the status bar are still missing from the README and are the most
valuable addition before a public launch.

## Verification checklist

1. `npm run lint && npm test` — clean.
2. `npm run compile` — bundle written, no type errors.
3. `npm run package` — `.vsix` produced; confirm `extension/dist/extension.js` is inside it.
4. `code --install-extension codingview-<version>.vsix` on a scratch profile, then add one symbol.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `master`/`main`, on pull requests and on demand:
`npm ci`, `npm run lint`, `npm test`, `npm run compile`, `xvfb-run -a npm run test:smoke` and
`npm run package`, then uploads the `.vsix` as an artifact. Node 22 is required there because
`@vscode/test-cli` needs it; the bundle itself still targets Node 18, so the `.vsix` runs on the
editor's own runtime.

## Troubleshooting

- npm's `allow-scripts` policy blocked the install scripts of `esbuild`, `@vscode/vsce-sign` and
  `keytar`. esbuild's platform binary comes from its optional dependency, so building and packaging
  work; approved scripts (`npm approve-scripts <pkg>`) may be needed for signed publishing.
- `vsce ls` prints only the tree root in this environment; judge the contents from the packed
  `.vsix` instead.
