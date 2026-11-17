import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { selectSimulatorRuntime } from './ios-simulator-config.mjs';

if (process.platform !== 'darwin') {
  throw new Error(
    'iOS application verification requires macOS, Xcode and an installed iOS simulator runtime.',
  );
}

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts/ios/simulator');
mkdirSync(output, { recursive: true });
const report = { source: process.env.IOS_SOURCE_SHA ?? 'local', status: 'started', checks: [] };

function run(binary, args, { capture = false, optional = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(
      `${binary} failed (${result.status}): ${result.error?.message ?? result.stderr ?? ''}`,
    );
  }
  return result.stdout?.trim() ?? '';
}

function find(directory, predicate) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (predicate(path, entry)) result.push(path);
    else if (
      entry.isDirectory() &&
      !entry.name.endsWith('.xcarchive') &&
      !entry.name.endsWith('.app')
    )
      result.push(...find(path, predicate));
  }
  return result;
}

const plist = (path, key) =>
  run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path], { capture: true });

// All database access is to a newly created CI simulator, never a personal device.
const databaseCheck = String.raw`
import sqlite3, json, sys, pathlib
root = pathlib.Path(sys.argv[1])
databases = [p for p in root.rglob('workspace.sqlite3') if not {'backups', 'recovery'}.intersection(p.relative_to(root).parts)]
if len(databases) != 1: raise RuntimeError('Expected exactly one private workspace database')
path = databases[0]
db = sqlite3.connect(path, timeout=5)
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not list(db.execute('PRAGMA foreign_key_check'))
assert db.execute('PRAGMA user_version').fetchone()[0] == 9
settings = dict(db.execute('SELECT key,value FROM settings'))
assert settings.get('last_backup_date'), 'Foreground maintenance has not completed its first backup'
if sys.argv[2] == 'prepare':
    # Fixture only: skip onboarding for the second screenshot. This does not
    # claim that the welcome button or the business forms have been UI-tested.
    db.execute("INSERT INTO settings(key,value) VALUES('onboarding_done',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (sys.argv[3],))
    db.commit()
else:
    assert settings.get('onboarding_done') == sys.argv[3], 'Onboarding setting did not survive restart'
    material_id = sys.argv[4]
    assert material_id, 'Missing bundled-SQLite upgrade fixture'
    item = db.execute('SELECT case_id,storage_name FROM materials WHERE id=?', (material_id,)).fetchone()
    assert item, 'Archived material did not survive upgrade'
    assert (path.parent / 'materials' / item[0] / material_id / item[1]).read_bytes() == b'bundled-to-system-sqlite-fixture'
    assert db.execute("SELECT title FROM cases WHERE id=?", (item[0],)).fetchone()[0] == 'SQLite upgrade fixture (fictional)'
print(json.dumps({'schema': 9, 'integrity': 'ok', 'privateDatabase': str(path.relative_to(root)), 'backupDate': settings['last_backup_date']}))
db.close()
`;

let device;
let bundle;
let upgradeFixture;
try {
  report.xcode = run('xcodebuild', ['-version'], { capture: true });
  report.arch = process.arch;
  const target = process.arch === 'arm64' ? 'aarch64-sim' : 'x86_64';
  // The CLI reads custom templates relative to its working directory. Resolve
  // explicitly so generation works independently of nested xcodebuild commands.
  const config = JSON.stringify({
    bundle: { iOS: { template: join(root, 'src-tauri/ios-project.yml') } },
  });
  run('npx', ['tauri', 'ios', 'init', '--ci', '--skip-targets-install', '--config', config]);
  run('npx', [
    'tauri',
    'ios',
    'build',
    '--debug',
    '--ci',
    '--no-sign',
    '--target',
    target,
    '--config',
    config,
  ]);

  const candidates = find(
    join(root, 'src-tauri/gen/apple'),
    (path, entry) =>
      entry.isDirectory() && entry.name.endsWith('.app') && !path.includes('.xcarchive/'),
  ).filter(
    (path) => plist(join(path, 'Info.plist'), 'CFBundleSupportedPlatforms:0') === 'iPhoneSimulator',
  );
  if (candidates.length !== 1)
    throw new Error(`Expected one simulator app, found ${candidates.length}`);
  const app = candidates[0];
  run('python3', [join(root, 'scripts/verify-ios-privacy.py'), app, '--debug']);
  report.checks.push('privacy-manifest-at-bundle-root');
  bundle = plist(join(app, 'Info.plist'), 'CFBundleIdentifier');
  if (bundle !== 'com.limushu.hm') throw new Error(`Unexpected bundle identifier: ${bundle}`);
  report.bundle = bundle;
  report.version = plist(join(app, 'Info.plist'), 'CFBundleShortVersionString');
  if (!plist(join(app, 'Info.plist'), 'NSMicrophoneUsageDescription').trim())
    throw new Error('Missing microphone permission description');
  report.checks.push('microphone-permission-description');
  run('ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    app,
    join(output, 'anjian-simulator.app.zip'),
  ]);
  report.checks.push('complete-xcode-application');

  const runtimes = JSON.parse(
    run('xcrun', ['simctl', 'list', 'runtimes', '-j'], { capture: true }),
  ).runtimes;
  report.simulatorSdk = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-version'], {
    capture: true,
  });
  const runtime = selectSimulatorRuntime(runtimes, report.simulatorSdk);
  const types = JSON.parse(
    run('xcrun', ['simctl', 'list', 'devicetypes', '-j'], { capture: true }),
  ).devicetypes;
  const runtimeVersion = runtime.version
    .split('.')
    .reduce((n, v, i) => n + Number(v) * 2 ** (16 - i * 8), 0);
  const type = [...types]
    .reverse()
    .find(
      (t) =>
        t.name.startsWith('iPhone') &&
        (t.minRuntimeVersion ?? 0) <= runtimeVersion &&
        (t.maxRuntimeVersion ?? Infinity) >= runtimeVersion,
    );
  if (!type) throw new Error('No compatible iPhone simulator device type');
  device = run(
    'xcrun',
    [
      'simctl',
      'create',
      `Anjian-CI-${process.env.GITHUB_RUN_ID ?? Date.now()}`,
      type.identifier,
      runtime.identifier,
    ],
    { capture: true },
  );
  report.runtime = runtime.version;
  report.device = type.name;
  run('xcrun', ['simctl', 'boot', device]);
  run('xcrun', ['simctl', 'bootstatus', device, '-b']);
  run('xcrun', ['simctl', 'install', device, app]);
  run('xcrun', ['simctl', 'launch', device, bundle]);
  const container = run('xcrun', ['simctl', 'get_app_container', device, bundle, 'data'], {
    capture: true,
  });
  const edition = 'hm-welcome-1';
  let prepared;
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(2000);
    prepared = run('python3', ['-c', databaseCheck, container, 'prepare', edition], {
      capture: true,
      optional: true,
    });
    if (prepared) break;
  }
  if (!prepared)
    throw new Error('Application did not create a valid private database and automatic backup');
  report.database = JSON.parse(prepared);
  report.checks.push('first-launch-private-sqlite-and-backup');
  await delay(4000);
  run('xcrun', ['simctl', 'io', device, 'screenshot', join(output, 'first-launch.png')]);
  run('xcrun', ['simctl', 'terminate', device, bundle]);
  // Only replace the empty workspace in this freshly created CI simulator.
  // The host target keeps bundled SQLite; the iOS app now uses system SQLite.
  upgradeFixture = mkdtempSync(join(tmpdir(), 'hm-ios-upgrade-'));
  report.upgradeFixture = JSON.parse(
    run(
      'cargo',
      [
        'run',
        '--locked',
        '-p',
        'hm-core',
        '--example',
        'ios_upgrade_fixture',
        '--',
        upgradeFixture,
        edition,
      ],
      { capture: true },
    ),
  );
  const database = resolve(container, report.database.privateDatabase);
  if (!database.startsWith(resolve(container) + '/'))
    throw new Error('Unexpected fixture destination');
  for (const suffix of ['', '-wal', '-shm']) rmSync(database + suffix, { force: true });
  cpSync(upgradeFixture, dirname(database), { recursive: true });
  run('xcrun', ['simctl', 'launch', device, bundle]);
  let retained;
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(2000);
    retained = run(
      'python3',
      ['-c', databaseCheck, container, 'reopen', edition, report.upgradeFixture.materialId],
      {
        capture: true,
        optional: true,
      },
    );
    if (retained) break;
  }
  if (!retained) throw new Error('Bundled-to-system SQLite workspace upgrade failed');
  report.checks.push('bundled-to-system-sqlite-workspace-and-material-retained');
  run('xcrun', ['simctl', 'io', device, 'screenshot', join(output, 'reopened-workspace.png')]);
  report.checks.push('restart-private-workspace-retained');
  run('node', [join(root, 'scripts/test-ios-viewport.mjs'), device]);
  report.checks.push('installed-app-full-window-and-pinned-case-actions');
  run('node', [join(root, 'scripts/test-ios-recording.mjs'), device]);
  report.checks.push('native-recording-scene-authorization-and-m4a');
  report.checks.push('native-speech-on-device-policy-chunks-and-cancellation');
  report.checks.push('native-document-picker-staging-and-export-callbacks');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  if (upgradeFixture) rmSync(upgradeFixture, { recursive: true, force: true });
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  if (device) {
    if (bundle) run('xcrun', ['simctl', 'terminate', device, bundle], { optional: true });
    run('xcrun', ['simctl', 'shutdown', device], { optional: true });
    run('xcrun', ['simctl', 'delete', device], { optional: true });
  }
}
