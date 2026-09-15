// Prints the CHANGELOG section for one version, which is what `gh release create --notes-file`
// publishes. The release workflow fails when the section is missing, so a release cannot ship
// without its notes.
//
//   node scripts/release-notes.mjs 0.2.0
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = (process.argv[2] ?? '').replace(/^v/, '').trim();
if (version.length === 0) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const changelog = join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
const lines = readFileSync(changelog, 'utf8').split('\n');
const heading = new RegExp(`^##\\s+${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
const start = lines.findIndex((line) => heading.test(line.trim()));
if (start === -1) {
  console.error(`CHANGELOG.md has no "## ${version}" section; add the notes before tagging.`);
  process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => /^##\s/.test(line.trim()));
const notes = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
if (notes.length === 0) {
  console.error(`The "## ${version}" section in CHANGELOG.md is empty.`);
  process.exit(1);
}

console.log(notes);
