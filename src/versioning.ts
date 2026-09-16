/**
 * The versioning rule, as pure functions: every change ships its own version, so a repository
 * state is only shippable when the manifest, the lockfile and the changelog agree and when the
 * version has not been released by an earlier commit. `scripts/check-version.mjs` and
 * `scripts/bump-version.mjs` do the file and git I/O around this; `docs/release.md` states the
 * rule for humans.
 */

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export interface VersionState {
  /** `package.json` version. */
  version: string;
  /** `version` at the top of `package-lock.json`. */
  lockVersion?: string;
  /** `packages[""].version` in `package-lock.json`. */
  lockRootVersion?: string;
  /** The changelog that must carry the notes for {@link VersionState.version}. */
  changelog?: string;
  /** Commit a `v<version>` tag points at, when that tag exists. */
  releasedCommit?: string;
  /** Current commit, so the release commit itself is not reported as stale. */
  headCommit?: string;
}

/** Everything wrong with a state, in the order a human should fix it. */
export function versionProblems(state: VersionState): string[] {
  const problems: string[] = [];
  if (!VERSION_PATTERN.test(state.version)) {
    problems.push(`package.json version "${state.version}" is not major.minor.patch.`);
  }
  if (state.lockVersion !== state.version || state.lockRootVersion !== state.version) {
    problems.push(
      `package-lock.json is on ${state.lockVersion ?? '(missing)'}/${state.lockRootVersion ?? '(missing)'} ` +
        `while package.json is on ${state.version}; run npm install or npm run version:bump.`,
    );
  }
  const notes = state.changelog === undefined ? undefined : changelogSection(state.changelog, state.version);
  if (notes === undefined) {
    problems.push(`CHANGELOG.md has no "## ${state.version}" section; write the release notes before tagging.`);
  } else if (notes.length === 0) {
    problems.push(`The "## ${state.version}" section in CHANGELOG.md is empty.`);
  }
  if (
    state.releasedCommit !== undefined &&
    state.headCommit !== undefined &&
    state.releasedCommit !== state.headCommit
  ) {
    problems.push(
      `Version ${state.version} was already released by an earlier commit; every change ships its own ` +
        'version, so bump it with npm run version:bump.',
    );
  }
  return problems;
}

/** Positive when `left` is newer than `right`; both are `major.minor.patch`. */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string): number[] => value.split('.').map((part) => Number.parseInt(part, 10));
  const [leftMajor, leftMinor, leftPatch] = parts(left);
  const [rightMajor, rightMinor, rightPatch] = parts(right);
  return leftMajor - rightMajor || leftMinor - rightMinor || leftPatch - rightPatch;
}

/**
 * Rewrites the version fields of `package.json` or `package-lock.json`. Only the first two
 * occurrences move — the top-level `version` and `packages[""].version` — so pinned dependency
 * versions stay untouched.
 */
export function replaceManifestVersion(text: string, version: string): string {
  let remaining = 2;
  return text.replace(/"version":\s*"[^"]*"/g, (match) => {
    if (remaining === 0) {
      return match;
    }
    remaining -= 1;
    return `"version": "${version}"`;
  });
}

/** Body of one `## <heading>` section, without the heading line; `undefined` when absent. */
export function changelogSection(changelog: string, heading: string): string | undefined {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    return undefined;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Renames the pending `## Unreleased` section to the version that is about to ship. */
export function renameUnreleasedHeading(changelog: string, version: string): string {
  const notes = changelogSection(changelog, 'Unreleased');
  if (notes === undefined) {
    throw new Error('CHANGELOG.md has no "## Unreleased" section; write the release notes under it first.');
  }
  if (notes.length === 0) {
    throw new Error('The "## Unreleased" section in CHANGELOG.md is empty; write the release notes first.');
  }
  const renamed = changelog.replace(/^##\s+Unreleased\s*$/m, `## ${version}`);
  // Markdown style: every section keeps one blank line between its heading and its first line.
  const lines = renamed.split('\n');
  const heading = `## ${version}`;
  const index = lines.indexOf(heading);
  if (index !== -1 && lines[index + 1] !== undefined && lines[index + 1].trim().length > 0) {
    lines.splice(index + 1, 0, '');
  }
  return lines.join('\n');
}
