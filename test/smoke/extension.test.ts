import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

interface Snapshot {
  text: string;
  tooltip: string;
  pinnedText?: string;
}

const SETTINGS = 'codingview';

async function findExtension(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON?.name === 'codingview');
  assert.ok(extension, 'CodingView should be installed in the test host');
  return extension;
}

async function snapshotOf(): Promise<Snapshot> {
  return vscode.commands.executeCommand<Snapshot>('codingview.test.snapshot');
}

async function setSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration(SETTINGS)
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/** Waits for the controller to react to a settings change. */
async function waitFor(check: (snapshot: Snapshot) => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const snapshot = await snapshotOf();
    if (check(snapshot)) {
      return;
    }
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${description}; last snapshot was ${JSON.stringify(snapshot)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

suite('CodingView in the extension host', () => {
  suiteSetup(async () => {
    await setSetting('watchlist', []);
    await setSetting('pinnedSymbol', '');
  });

  suiteTeardown(async () => {
    await setSetting('watchlist', []);
    await setSetting('pinnedSymbol', '');
  });

  test('activates', async () => {
    const extension = await findExtension();

    await extension.activate();

    assert.equal(extension.isActive, true);
  });

  test('registers every contributed command', async () => {
    const extension = await findExtension();
    const contributed = Object.keys(extension.packageJSON.contributes.commands).map(
      (index) => extension.packageJSON.contributes.commands[index].command,
    );
    const registered = await vscode.commands.getCommands(true);

    for (const command of contributed) {
      assert.ok(registered.includes(command), `${command} should be registered`);
    }
  });

  test('renders the empty-watchlist placeholder', async () => {
    await setSetting('watchlist', []);

    await waitFor((snapshot) => snapshot.text.includes('Add a symbol'), 'the placeholder');
  });

  test('switches to the first symbol once the watchlist has one', async () => {
    await setSetting('watchlist', ['cn:600519']);

    await waitFor(
      (snapshot) => snapshot.text.includes('600519'),
      'the status bar to show cn:600519',
    );
  });

  test('lists an ignored entry in the tooltip with a command link to remove it', async () => {
    await setSetting('watchlist', ['nope']);

    await waitFor(
      (snapshot) => snapshot.tooltip.includes('Ignored entries'),
      'the tooltip to list the ignored entry',
    );
    const snapshot = await snapshotOf();

    assert.match(snapshot.tooltip, /command:codingview\.removeSymbolEntry\?/);
    assert.match(snapshot.tooltip, /nope/);
  });

  test('shows the pinned symbol in its own item', async () => {
    await setSetting('watchlist', ['cn:600519', 'us:AAPL']);
    await setSetting('pinnedSymbol', 'us:AAPL');

    await waitFor(
      (snapshot) => snapshot.pinnedText !== undefined && snapshot.pinnedText.includes('AAPL'),
      'the pinned item',
    );
    const snapshot = await snapshotOf();

    assert.ok(!snapshot.text.includes('AAPL'), 'the pinned symbol should leave the rotation');
  });
});
