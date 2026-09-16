import { describe, expect, test } from 'vitest';

import {
  changelogSection,
  compareVersions,
  isShippedPath,
  renameUnreleasedHeading,
  replaceManifestVersion,
  versionProblems,
} from '../versioning';

const CHANGELOG = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  '- Lighter can be tracked as `crypto:gate:LIT_USDT`.',
  '',
  '## 0.2.0',
  '',
  '- Hong Kong listings.',
  '',
].join('\n');

const MANIFEST = ['{', '  "name": "codingview",', '  "version": "0.2.0",', '  "license": "MIT"', '}', ''].join('\n');

const LOCK = [
  '{',
  '  "name": "codingview",',
  '  "version": "0.2.0",',
  '  "lockfileVersion": 3,',
  '  "packages": {',
  '    "": {',
  '      "name": "codingview",',
  '      "version": "0.2.0"',
  '    },',
  '    "node_modules/left-pad": {',
  '      "version": "1.3.0"',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

const OK_STATE = {
  version: '0.3.0',
  lockVersion: '0.3.0',
  lockRootVersion: '0.3.0',
  changelog: CHANGELOG.replace('## Unreleased', '## 0.3.0'),
};

describe('versionProblems', () => {
  test('accepts a bumped, documented, unreleased version', () => {
    expect(versionProblems(OK_STATE)).toEqual([]);
  });

  test('reports a lockfile that lags the manifest', () => {
    expect(versionProblems({ ...OK_STATE, lockVersion: '0.2.0' })).toEqual([
      expect.stringContaining('package-lock.json'),
    ]);
    expect(versionProblems({ ...OK_STATE, lockRootVersion: '0.2.0' })).toHaveLength(1);
  });

  test('reports a missing or an empty changelog section', () => {
    expect(versionProblems({ ...OK_STATE, changelog: CHANGELOG.replace('## 0.3.0', '## 0.1.0') })).toEqual([
      expect.stringContaining('CHANGELOG.md'),
    ]);
    expect(versionProblems({ ...OK_STATE, changelog: '## 0.3.0\n\n## 0.2.0\n\n- x\n' })).toEqual([
      expect.stringContaining('CHANGELOG.md'),
    ]);
  });

  test('accepts a docs-only change on top of a released version', () => {
    expect(
      versionProblems({
        ...OK_STATE,
        releasedCommit: 'aaa',
        headCommit: 'bbb',
        changedPaths: [
          'AGENTS.md',
          'docs/release.md',
          'scripts/check-version.mjs',
          'src/test/versioning.test.ts',
        ],
      }),
    ).toEqual([]);
  });

  test('reports a shipped change that reused a released version, naming the paths', () => {
    const problems = versionProblems({
      ...OK_STATE,
      releasedCommit: 'aaa',
      headCommit: 'bbb',
      changedPaths: ['src/quoteService.ts', 'CHANGELOG.md'],
    });

    expect(problems).toEqual([expect.stringContaining('already released')]);
    expect(problems[0]).toContain('src/quoteService.ts');
  });

  test('reports a released version when the changed files could not be read', () => {
    expect(versionProblems({ ...OK_STATE, releasedCommit: 'aaa', headCommit: 'bbb' })).toEqual([
      expect.stringContaining('already released'),
    ]);
  });

  test('accepts the release commit that the tag points at', () => {
    expect(versionProblems({ ...OK_STATE, releasedCommit: 'aaa', headCommit: 'aaa' })).toEqual([]);
  });

  test('rejects a version that is not major.minor.patch', () => {
    // A malformed version also desynchronises the lockfile and the changelog, so only the first
    // problem is asserted — that is the one a human has to fix first.
    expect(versionProblems({ ...OK_STATE, version: '0.3' })[0]).toContain('not major.minor.patch');
  });
});

describe('isShippedPath', () => {
  test('counts everything that can reach the .vsix as shipped', () => {
    for (const path of [
      'src/extension.ts',
      'src/providers/sina.ts',
      'media/icon.png',
      'l10n/bundle.l10n.zh-cn.json',
      'package.json',
      'package-lock.json',
      'esbuild.mjs',
      '.vscodeignore',
    ]) {
      expect(isShippedPath(path), path).toBe(true);
    }
  });

  test('leaves documentation, CI, scripts and tests out', () => {
    for (const path of [
      'AGENTS.md',
      'README.md',
      'CHANGELOG.md',
      'docs/release.md',
      '.github/workflows/ci.yml',
      'scripts/check-version.mjs',
      'test/smoke/extension.test.ts',
      'src/test/versioning.test.ts',
      'src/test/fixtures/tencent.json',
      '.gitignore',
      'eslint.config.mjs',
    ]) {
      expect(isShippedPath(path), path).toBe(false);
    }
  });
});

describe('compareVersions', () => {
  test('orders versions numerically, not as strings', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.1', '0.3.0')).toBeLessThan(0);
  });
});

describe('replaceManifestVersion', () => {
  test('rewrites the manifest version and leaves other fields alone', () => {
    expect(replaceManifestVersion(MANIFEST, '0.3.0')).toContain('"version": "0.3.0"');
    expect(JSON.parse(replaceManifestVersion(MANIFEST, '0.3.0')).name).toBe('codingview');
  });

  test('rewrites only the two lockfile version fields', () => {
    const bumped = replaceManifestVersion(LOCK, '0.3.0');
    const lock = JSON.parse(bumped);

    expect(lock.version).toBe('0.3.0');
    expect(lock.packages[''].version).toBe('0.3.0');
    expect(lock.packages['node_modules/left-pad'].version).toBe('1.3.0');
  });
});

describe('changelogSection', () => {
  test('reads one section body', () => {
    expect(changelogSection(CHANGELOG, '0.2.0')).toBe('- Hong Kong listings.');
    expect(changelogSection(CHANGELOG, 'Unreleased')).toBe('- Lighter can be tracked as `crypto:gate:LIT_USDT`.');
  });

  test('answers undefined for a heading that is not there', () => {
    expect(changelogSection(CHANGELOG, '9.9.9')).toBeUndefined();
  });
});

describe('renameUnreleasedHeading', () => {
  test('turns the pending section into the released one', () => {
    const renamed = renameUnreleasedHeading(CHANGELOG, '0.3.0');

    expect(renamed).toContain('## 0.3.0');
    expect(renamed).not.toContain('Unreleased');
    expect(changelogSection(renamed, '0.2.0')).toBe('- Hong Kong listings.');
  });

  test('refuses to invent a section that has no notes', () => {
    expect(() => renameUnreleasedHeading('# Changelog\n\n## 0.2.0\n\n- x\n', '0.3.0')).toThrowError(
      '## Unreleased',
    );
  });

  test('keeps a blank line between the heading and the notes', () => {
    expect(renameUnreleasedHeading('# Changelog\n\n## Unreleased\n- pending\n', '0.3.0')).toBe(
      '# Changelog\n\n## 0.3.0\n\n- pending\n',
    );
  });
});
