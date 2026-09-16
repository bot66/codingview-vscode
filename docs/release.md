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
| `npm run check:version` | enforces the versioning rule below: manifest, lockfile and changelog agree, and the version is not already released |
| `npm run version:bump -- <version>` | moves `package.json`, both `package-lock.json` version fields and the `## Unreleased` heading to `<version>` |

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

## Distribution

Releases are **GitHub Release assets**, and that is the only channel: the project has no Visual
Studio Marketplace publisher and no plans for one (see [decisions.md](decisions.md)). Users download
the `.vsix` from the release page and install it with `code --install-extension codingview-<version>.vsix`.

`package.json` still carries a `publisher` field because it is part of the extension identifier
(`bot66.codingview`), which appears in VS Code's extension host and in logs; it is not a Marketplace
registration. `repository`, `bugs` and `icon` stay because the README links to them and VS Code shows
the icon.

## Versioning rule

**A release per source change.** Every change that can alter the extension users install carries its
own version number, and that version becomes a GitHub Release — nothing waits for "release day".
Documentation-only work lands without a bump and rides along with the next release:

| Path | Needs its own version? |
| --- | --- |
| `src/` except `src/test/`, `media/`, `l10n/`, `package.json`, `package-lock.json`, `esbuild.mjs`, `.vscodeignore` | yes |
| `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/`, `.github/`, `scripts/`, `test/`, `src/test/` | no |

`README.md` and `CHANGELOG.md` do travel inside the `.vsix`, but they are documentation: they cannot
change what the extension does, so they never burn a version of their own.

Batching the bumps is how the manifest ended up on `0.2.0` while `package-lock.json` stayed on
`0.1.0`, so the rule is enforced by `npm run check:version` in CI rather than by memory.

| Change | Bump | Example |
| --- | --- | --- |
| New feature, new provider, changed behaviour — including breaking changes, which must be called out in the notes | MINOR | `0.3.0` → `0.4.0` |
| Bug fix, wording, translation, dependency, packaging or build change that reaches the package | PATCH | `0.3.0` → `0.3.1` |
| Steady state | MAJOR | reserved for `1.0.0`, once symbols and settings are settled |

Steps for one change that ships:

1. Write the change and its notes under `## Unreleased` in `CHANGELOG.md`.
2. `npm run version:bump -- <next>` — moves `package.json`, both `package-lock.json` version fields
   and renames the changelog heading in one step. It refuses to run without pending notes and
   refuses a version that is not greater than the current one.
3. `npm run lint && npm test && npm run compile`, plus `npm run test:smoke` when the change touches
   the VS Code layer or the manifest, and `npm run check:version`.
4. Commit, then tag and push: `git tag v<version> && git push origin master v<version>`.
5. `release.yml` runs the same gates, packages the `.vsix` and publishes the Release with the
   changelog section as its notes.

A change that does not ship skips the notes, the bump and the tag: commit and push it, and it lands
under the version of the last release.

`npm run check:version` fails when:

- `package.json` and either `package-lock.json` version field disagree;
- `CHANGELOG.md` has no `## <version>` section, or that section is empty;
- `v<version>` already exists, points at an earlier commit, and the diff since that commit touches a
  shipped path — the reuse of a released version. A docs-only commit on top of the released version
  passes.

The release workflow runs the same script with `--release`, because there the tag is *supposed* to
exist at `HEAD`; it still checks the lockfile and the changelog.

### Cutting a release

1. Follow the versioning rule above: notes under `## Unreleased`, then
   `npm run version:bump -- <version>`. The renamed section becomes the release notes, and the
   workflow fails without it.
2. Verify locally: `npm run lint && npm test && npm run compile && npm run test:smoke`, then
   `npm run package` and install the `.vsix` on a scratch profile.
3. Commit the bump, tag it and push the tag:

   ```bash
   git tag v0.3.0
   git push origin master v0.3.0
   ```

4. `.github/workflows/release.yml` then checks that the tag matches `package.json`, runs the same
   gates as CI, packages the extension and creates the GitHub Release with the `.vsix` attached and
   the changelog section as its notes. Re-running the failed job is enough if a step trips.

When the extension identifier changes — `publisher` or `name` in `package.json`, for example the
`tgc.codingview` → `bot66.codingview` rename in 0.3.0 — VS Code treats the result as a *new*
extension and keeps the old one installed and enabled. Both then register the same command ids, the
second activation aborts with `command 'codingview.addSymbol' already exists`, and the new commands
look missing. The release notes must tell users to uninstall the previous build first, so verify the
upgrade path on a scratch profile with the previous `.vsix` installed before tagging.

There is no pre-release channel: users on `master` get unreleased behaviour only by building the
`.vsix` themselves.

## Listing requirements

| Asset | Requirement |
| --- | --- |
| `media/icon.png` | 128×128 PNG, referenced by `icon`; regenerate with `node scripts/generate-icon.mjs` |
| `README.md` | The project page and the content of the extension details view; keep the tables accurate |
| `LICENSE` | MIT; vsce repackages it as `LICENSE.txt` |
| `CHANGELOG.md` | Per-release notes; the release workflow prints the matching section |
| `engines.vscode` | `^1.90.0`; raise it deliberately, it gates installation for older editors |

`media/statusbar.png` and `media/rotation.gif` are captured from a real window with
`npm run media` (see the script's header for the VS Code binary it needs). Both files stay in the
package because VS Code renders the bundled README in the extension details view, where relative
image links resolve to the extension's own files; GitHub renders the same paths from the repository.
Re-run the script after a rendering change: a host without a CJK font draws the Chinese instrument
names as boxes, which is how the first attempt looked.

## Verification checklist

1. `npm run lint && npm test` — clean.
2. `npm run compile` — bundle written, no type errors.
3. `npm run package` — `.vsix` produced; confirm `extension/dist/extension.js` is inside it.
4. `code --install-extension codingview-<version>.vsix` on a scratch profile, then add one symbol.
5. Tag `v<version>` once the checklist is green, which publishes the `.vsix` to the release page.

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
