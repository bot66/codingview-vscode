// Enforces the versioning rule from docs/release.md: every change ships its own version, so a
// checkout is only shippable when package.json, package-lock.json and CHANGELOG.md agree and when
// the version has not been released by an earlier commit. CI runs this on every push and pull
// request; the release workflow runs it with --release, where the tag is expected to exist.
//
//   npm run check:version
//   node scripts/check-version.mjs --release
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const bundleDirectory = mkdtempSync(join(tmpdir(), 'codingview-version-'));
const bundlePath = join(bundleDirectory, 'versioning.mjs');

await build({
  stdin: {
    contents: "export { versionProblems } from './src/versioning';",
    resolveDir: process.cwd(),
    sourcefile: 'version-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: bundlePath,
  logLevel: 'silent',
});

const { versionProblems } = await import(pathToFileURL(bundlePath).href);

/** Output of a git command, or undefined when it fails (an unknown tag, for example). */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const version = manifest.version;
const releaseRun = process.argv.includes('--release');

const problems = versionProblems({
  version,
  lockVersion: lock.version,
  lockRootVersion: lock.packages?.['']?.version,
  changelog: readFileSync('CHANGELOG.md', 'utf8'),
  // On a release run the tag exists by definition and the workflow already matched it to the
  // manifest, so only the non-release check looks for an earlier commit that shipped this version.
  releasedCommit: releaseRun ? undefined : git(['rev-list', '-n', '1', `v${version}`]),
  headCommit: git(['rev-parse', 'HEAD']),
});

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`::error::${problem}`);
    console.error(problem);
  }
  process.exit(1);
}

console.log(`Version ${version} is ready to ship (see docs/release.md for the release steps).`);
