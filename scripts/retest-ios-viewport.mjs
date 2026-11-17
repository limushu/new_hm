import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { selectSimulatorRuntime } from './ios-simulator-config.mjs';

if (process.platform !== 'darwin') throw new Error('Requires the CI Mac');
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'artifacts/ios/source');
const output = join(root, 'artifacts/ios/simulator');
const temporary = mkdtempSync(join(tmpdir(), 'hm-viewport-retest-'));
mkdirSync(output, { recursive: true });
function run(binary, args, { capture = false, optional = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(`${binary} viewport retest failed: ${result.status}`);
  }
  return result.stdout?.trim() ?? '';
}
function files(path, predicate) {
  const found = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (predicate(child, entry)) found.push(child);
    else if (entry.isDirectory()) found.push(...files(child, predicate));
  }
  return found;
}
let device;
try {
  const verified = JSON.parse(readFileSync(join(source, 'verification.json'), 'utf8'));
  if (
    verified.bundle !== 'com.limushu.hm' ||
    verified.arch !== process.arch ||
    !/^[a-f0-9]{40}$/.test(verified.source)
  )
    throw new Error('Invalid simulator artifact');
  if (!verified.checks.includes('bundled-to-system-sqlite-workspace-and-material-retained'))
    throw new Error('Source must have passed app build, launch and persistence checks');
  // A UI probe can be rerun after correcting the probe, even when that probe
  // failed previously. Require identical product sources and preserve provenance.
  run('git', [
    'diff',
    '--exit-code',
    verified.source,
    'HEAD',
    '--',
    'src',
    'src-tauri',
    'crates',
    'Cargo.toml',
    'Cargo.lock',
    'package.json',
    'package-lock.json',
    'index.html',
    'public',
    'vite.config.ts',
    'tsconfig*.json',
    'scripts/copy-pdf-assets.mjs',
    'scripts/ios-icons.mjs',
    'scripts/build-ios-testflight.mjs',
    'scripts/verify-ios-simulator.mjs',
  ]);
  run('ditto', ['-x', '-k', join(source, 'anjian-simulator.app.zip'), temporary]);
  const apps = files(temporary, (p, e) => e.isDirectory() && p.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one built application');
  const sdk = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-version'], { capture: true });
  const runtimes = JSON.parse(
    run('xcrun', ['simctl', 'list', 'runtimes', '-j'], { capture: true }),
  ).runtimes;
  const runtime = selectSimulatorRuntime(runtimes, sdk);
  device = run(
    'xcrun',
    [
      'simctl',
      'create',
      'Anjian-Viewport-Retest',
      'com.apple.CoreSimulator.SimDeviceType.iPhone-11-Pro-Max',
      runtime.identifier,
    ],
    { capture: true },
  );
  run('xcrun', ['simctl', 'boot', device]);
  run('xcrun', ['simctl', 'bootstatus', device, '-b']);
  run('xcrun', ['simctl', 'install', device, apps[0]]);
  run('xcrun', ['simctl', 'launch', device, 'com.limushu.hm']);
  const container = run(
    'xcrun',
    ['simctl', 'get_app_container', device, 'com.limushu.hm', 'data'],
    { capture: true },
  );
  let databases = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(1000);
    databases = files(
      container,
      (p, e) => e.isFile() && p.endsWith('/workspace.sqlite3') && !p.includes('/backups/'),
    );
    if (databases.length === 1) break;
  }
  if (databases.length !== 1) throw new Error('Missing fresh private workspace');
  run('xcrun', ['simctl', 'terminate', device, 'com.limushu.hm']);
  const fixture = join(temporary, 'fixture');
  run('cargo', [
    'run',
    '--locked',
    '-p',
    'hm-core',
    '--example',
    'ios_upgrade_fixture',
    '--',
    fixture,
    'hm-welcome-1',
  ]);
  for (const suffix of ['', '-wal', '-shm']) rmSync(databases[0] + suffix, { force: true });
  cpSync(fixture, dirname(databases[0]), { recursive: true });
  run('xcrun', ['simctl', 'launch', device, 'com.limushu.hm']);
  await delay(3000);
  console.log(
    JSON.stringify({
      source: verified.source,
      retestedWith: process.env.GITHUB_SHA,
      runtime: runtime.version,
    }),
  );
  run('node', [join(root, 'scripts/test-ios-viewport.mjs'), device]);
} finally {
  if (device) {
    run('xcrun', ['simctl', 'shutdown', device], { optional: true });
    run('xcrun', ['simctl', 'delete', device], { optional: true });
  }
  rmSync(temporary, { recursive: true, force: true });
}
