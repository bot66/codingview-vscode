import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/smoke/**/*.test.js',
  version: 'stable',
  extensionDevelopmentPath: '.',
  launchArgs: ['--disable-extensions', '--disable-gpu', '--disable-workspace-trust', '--no-sandbox'],
  mocha: { ui: 'tdd', timeout: 30000 },
});
