import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
assert db.execute('PRAGMA user_version').fetchone()[0] == 7
settings = dict(db.execute('SELECT key,value FROM settings'))
assert settings.get('last_backup_date'), 'Foreground maintenance has not completed its first backup'
if sys.argv[2] == 'prepare':
    # Fixture only: skip onboarding for the second screenshot. This does not
    # claim that the welcome button or the business forms have been UI-tested.
    db.execute("INSERT INTO settings(key,value) VALUES('onboarding_done',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (sys.argv[3],))
    db.commit()
else:
    assert settings.get('onboarding_done') == sys.argv[3], 'Onboarding setting did not survive restart'
print(json.dumps({'schema': 7, 'integrity': 'ok', 'privateDatabase': str(path.relative_to(root)), 'backupDate': settings['last_backup_date']}))
db.close()
`;

let device;
let bundle;
try {
  report.xcode = run('xcodebuild', ['-version'], { capture: true });
  report.arch = process.arch;
  const target = process.arch === 'arm64' ? 'aarch64-sim' : 'x86_64';
  run('npx', ['tauri', 'ios', 'init', '--ci', '--skip-targets-install']);
  run('npx', ['tauri', 'ios', 'build', '--debug', '--ci', '--no-sign', '--target', target]);

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
  const runtime = runtimes
    .filter((r) => r.isAvailable && r.identifier.includes('.iOS-'))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  if (!runtime) throw new Error('No available iOS simulator runtime');
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
  run('xcrun', ['simctl', 'launch', device, bundle]);
  await delay(4000);
  run('python3', ['-c', databaseCheck, container, 'reopen', edition], { capture: true });
  run('xcrun', ['simctl', 'io', device, 'screenshot', join(output, 'reopened-workspace.png')]);
  report.checks.push('restart-private-workspace-retained');
  run('node', [join(root, 'scripts/test-ios-recording.mjs'), device]);
  report.checks.push('native-recording-scene-authorization-and-m4a');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  if (device) {
    if (bundle) run('xcrun', ['simctl', 'terminate', device, bundle], { optional: true });
    run('xcrun', ['simctl', 'shutdown', device], { optional: true });
    run('xcrun', ['simctl', 'delete', device], { optional: true });
  }
}
