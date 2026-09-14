// Live provider check: bundles the TypeScript sources with esbuild and asks the real
// endpoints for one sample symbol per market. Fixtures are copied from real payloads, so a
// drift between fixture and endpoint shows up here before it ships.
//
//   npm run verify:live                 # cn:600519, hk:00700, us:AAPL, crypto:BTCUSDT
//   npm run verify:live -- cn:000001    # any watchlist entries
//   npm run verify:live -- --provider=tencent --timeout=25
//
// Exits non-zero when a symbol stays unresolved. Provider errors that a fallback covered are
// printed but do not fail the run.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundleDirectory = mkdtempSync(join(tmpdir(), 'codingview-live-'));
const bundlePath = join(bundleDirectory, 'providers.mjs');

await build({
  stdin: {
    contents: [
      "export { createDefaultProviders } from './src/providers/index';",
      "export { parseInstrument } from './src/symbols';",
      "export { QuoteService } from './src/quoteService';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'live-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: bundlePath,
  logLevel: 'silent',
});

const { createDefaultProviders, parseInstrument, QuoteService } = await import(pathToFileURL(bundlePath).href);

const args = process.argv.slice(2);
const providerMode = args.find((argument) => argument.startsWith('--provider='))?.slice('--provider='.length);
const timeoutMs = Number(args.find((argument) => argument.startsWith('--timeout='))?.slice('--timeout='.length) ?? 8) * 1000;
const entries = args.filter((argument) => !argument.startsWith('--'));
const targets = entries.length > 0 ? entries : ['cn:600519', 'hk:00700', 'us:AAPL', 'crypto:BTCUSDT'];
const service = new QuoteService({
  providers: createDefaultProviders(),
  providerMode,
  timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
});
const outcome = await service.refresh(targets.map((entry) => parseInstrument(entry)));

for (const quote of outcome.quotes) {
  console.log(
    `${quote.id.padEnd(16)} ${String(quote.price).padStart(12)} ${quote.currency ?? ''} ` +
      `${quote.changePercent ?? '--'}%  [${quote.source}] ${quote.name ?? ''}`,
  );
}
for (const id of outcome.missing) {
  console.log(`${id.padEnd(16)} unresolved`);
}
for (const failure of outcome.providerErrors) {
  console.log(`provider error: ${failure}`);
}
for (const id of outcome.skipped) {
  console.log(`provider skipped (tripped circuit): ${id}`);
}

process.exit(outcome.missing.length === 0 ? 0 : 1);
