// The mechanical half of the versioning rule in docs/release.md: move package.json, both
// package-lock.json version fields and the "## Unreleased" changelog heading to the next version in
// one step, so a bump cannot half-happen the way 0.2.0 did. The commit, the tag and the push stay
// manual — this only edits files.
//
//   npm run version:bump -- 0.3.0
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const next = (process.argv[2] ?? '').trim();
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('usage: npm run version:bump -- <major.minor.patch>');
  process.exit(2);
}

const bundleDirectory = mkdtempSync(join(tmpdir(), 'codingview-bump-'));
const bundlePath = join(bundleDirectory, 'versioning.mjs');

await build({
  stdin: {
    contents:
      "export { compareVersions, renameUnreleasedHeading, replaceManifestVersion, versionProblems } from './src/versioning';",
    resolveDir: process.cwd(),
    sourcefile: 'version-bump-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: bundlePath,
  logLevel: 'silent',
});

const { compareVersions, renameUnreleasedHeading, replaceManifestVersion, versionProblems } = await import(
  pathToFileURL(bundlePath).href
);

const manifestPath = 'package.json';
const lockPath = 'package-lock.json';
const changelogPath = 'CHANGELOG.md';

const manifestText = readFileSync(manifestPath, 'utf8');
const lockText = readFileSync(lockPath, 'utf8');
const changelogText = readFileSync(changelogPath, 'utf8');
const current = JSON.parse(manifestText).version;

if (compareVersions(next, current) <= 0) {
  console.error(`The next version ${next} must be greater than the current ${current}.`);
  process.exit(2);
}

// Fails before writing anything when the changelog has no pending notes to release.
const nextChangelog = renameUnreleasedHeading(changelogText, next);
const nextManifest = replaceManifestVersion(manifestText, next);
const nextLock = replaceManifestVersion(lockText, next);

writeFileSync(manifestPath, nextManifest);
writeFileSync(lockPath, nextLock);
writeFileSync(changelogPath, nextChangelog);

const problems = versionProblems({
  version: next,
  lockVersion: JSON.parse(nextLock).version,
  lockRootVersion: JSON.parse(nextLock).packages?.['']?.version,
  changelog: nextChangelog,
});
if (problems.length > 0) {
  console.error('The bump left the checkout inconsistent:');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log(`Bumped ${current} -> ${next} in package.json, package-lock.json and CHANGELOG.md.`);
console.log(`Next: npm run lint && npm test && npm run compile, then commit, then`);
console.log(`      git tag v${next} && git push origin master v${next}`);
