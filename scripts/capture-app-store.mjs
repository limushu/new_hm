import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

if (process.platform !== 'darwin') throw new Error('Native screenshots require macOS and Xcode');
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'artifacts/app-store/source');
const output = join(root, 'artifacts/app-store/materials');
const temporary = mkdtempSync(join(tmpdir(), 'hm-store-screenshots-'));
mkdirSync(output, { recursive: true });
const devices = [];
const report = { status: 'started', fictionalData: true, devices: [] };
const bundle = 'com.limushu.hm';

function run(binary, args, { capture = false, optional = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 12 * 60 * 1000,
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(`${binary}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  return result.stdout?.trim() ?? '';
}

function walk(path, predicate) {
  const matches = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (predicate(child, entry)) matches.push(child);
    else if (entry.isDirectory()) matches.push(...walk(child, predicate));
  }
  return matches;
}

try {
  const verified = JSON.parse(readFileSync(join(source, 'verification.json'), 'utf8'));
  if (verified.status !== 'passed' || verified.bundle !== bundle || verified.arch !== process.arch)
    throw new Error('Source must be a passed simulator build with the same host architecture');
  if (!/^[a-f0-9]{40}$/.test(verified.source)) throw new Error('Missing source commit');
  // Reuse the real verified app, and fail if its product sources differ from HEAD.
  run('git', [
    'diff',
    '--exit-code',
    verified.source,
    'HEAD',
    '--',
    'src',
    'src-tauri',
    'Cargo.toml',
    'Cargo.lock',
    'crates',
    ':(exclude)crates/hm-core/examples',
  ]);
  report.source = verified.source;
  report.version = verified.version;
  run('ditto', ['-x', '-k', join(source, 'anjian-simulator.app.zip'), temporary]);
  const apps = walk(temporary, (path, entry) => entry.isDirectory() && path.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one real simulator application');
  const app = apps[0];
  const runtimes = JSON.parse(
    run('xcrun', ['simctl', 'list', 'runtimes', '-j'], { capture: true }),
  ).runtimes;
  const runtime = runtimes
    .filter((item) => item.isAvailable && item.identifier.includes('.iOS-'))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  if (!runtime) throw new Error('No iOS simulator runtime');
  const version = runtime.version
    .split('.')
    .reduce((n, v, i) => n + Number(v) * 2 ** (16 - i * 8), 0);
  const types = JSON.parse(
    run('xcrun', ['simctl', 'list', 'devicetypes', '-j'], { capture: true }),
  ).devicetypes.filter(
    (item) =>
      (item.minRuntimeVersion ?? 0) <= version && (item.maxRuntimeVersion ?? Infinity) >= version,
  );
  const families = [
    {
      name: 'iphone',
      model: types.find((item) => item.name === 'iPhone 16 Pro'),
      size: [1206, 2622],
    },
    {
      name: 'iphone-large',
      model: types.find((item) => item.name === 'iPhone 16 Pro Max'),
      size: [1320, 2868],
    },
    {
      name: 'ipad',
      model: types.find((item) => item.name === 'iPad Pro 13-inch (M4)'),
      size: [2064, 2752],
    },
  ];
  if (families.some((item) => !item.model))
    throw new Error(
      'Required medium/large Dynamic Island iPhone or 13-inch iPad simulator unavailable',
    );
  const requested = (process.env.SCREENSHOT_FAMILIES ?? families.map((item) => item.name).join(','))
    .split(',')
    .map((name) => name.trim());
  if (!requested.length || requested.some((name) => !families.some((item) => item.name === name)))
    throw new Error('Unknown screenshot device family');

  const exportPng = join(temporary, 'export-store-png');
  run('xcrun', ['swiftc', join(root, 'scripts/export-store-png.swift'), '-o', exportPng]);

  const spec = {
    name: 'AppStoreScreenshots',
    options: { deploymentTarget: { iOS: '15.0' } },
    settings: { base: { SWIFT_VERSION: '5.0', CODE_SIGNING_ALLOWED: 'NO' } },
    targets: {
      ScreenshotHost: {
        type: 'application',
        platform: 'iOS',
        sources: [join(root, 'tests/native/ios-recording/Host.swift')],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.screenshothost',
            TARGETED_DEVICE_FAMILY: '1,2',
          },
        },
        info: {
          path: 'ScreenshotHost-Info.plist',
          properties: {
            UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false },
            UILaunchScreen: {},
          },
        },
      },
      StoreScreenshots: {
        type: 'bundle.ui-testing',
        platform: 'iOS',
        sources: [join(root, 'tests/native/app-store/Screenshots.swift')],
        dependencies: [{ target: 'ScreenshotHost' }],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.storescreenshots',
            GENERATE_INFOPLIST_FILE: 'YES',
            TARGETED_DEVICE_FAMILY: '1,2',
            TEST_TARGET_NAME: 'ScreenshotHost',
          },
        },
      },
    },
    schemes: {
      AppStoreScreenshots: {
        build: { targets: { StoreScreenshots: ['test'] } },
        test: { targets: ['StoreScreenshots'] },
      },
    },
  };
  const specPath = join(temporary, 'project.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  run('xcodegen', ['generate', '--spec', specPath]);

  const fixture = join(temporary, 'fixture');
  const today = run('date', ['+%Y-%m-%d'], { capture: true });
  run('cargo', [
    'run',
    '--locked',
    '-p',
    'hm-core',
    '--example',
    'app_store_fixture',
    '--',
    fixture,
    today,
  ]);
  const project = join(temporary, 'AppStoreScreenshots.xcodeproj');
  let built = false;
  for (const family of families.filter((item) => requested.includes(item.name))) {
    const device = run(
      'xcrun',
      [
        'simctl',
        'create',
        `Anjian-Store-${family.name}-${Date.now()}`,
        family.model.identifier,
        runtime.identifier,
      ],
      { capture: true },
    );
    devices.push(device);
    run('xcrun', ['simctl', 'boot', device]);
    run('xcrun', ['simctl', 'bootstatus', device, '-b']);
    // Keep a real Simulator display attached so WebKit's compositor paints
    // frames as well as exposing its accessibility tree on headless CI hosts.
    // An existing Simulator GUI ignores new launch arguments. Restart only its
    // GUI so each booted device gets a real display before WebKit starts.
    run('killall', ['Simulator'], { optional: true });
    await delay(1000);
    run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device]);
    await delay(3000);
    run('xcrun', ['simctl', 'ui', device, 'appearance', 'light']);
    run('xcrun', [
      'simctl',
      'status_bar',
      device,
      'override',
      '--time',
      '9:41',
      '--dataNetwork',
      'wifi',
      '--wifiMode',
      'active',
      '--wifiBars',
      '3',
      '--batteryState',
      'charged',
      '--batteryLevel',
      '100',
    ]);
    run('xcrun', ['simctl', 'install', device, app]);
    run('xcrun', ['simctl', 'launch', device, bundle]);
    const container = run('xcrun', ['simctl', 'get_app_container', device, bundle, 'data'], {
      capture: true,
    });
    let database;
    for (let attempt = 0; attempt < 30; attempt++) {
      await delay(1000);
      const found = walk(
        container,
        (path, entry) =>
          entry.isFile() && path.endsWith('/workspace.sqlite3') && !path.includes('/backups/'),
      );
      if (found.length === 1) {
        database = found[0];
        break;
      }
    }
    if (!database || !database.startsWith(resolve(container) + '/'))
      throw new Error('Fresh app did not create a private workspace');
    run('xcrun', ['simctl', 'terminate', device, bundle]);
    for (const suffix of ['', '-wal', '-shm']) rmSync(database + suffix, { force: true });
    cpSync(fixture, dirname(database), { recursive: true });
    run('xcrun', ['simctl', 'launch', device, bundle]);
    await delay(4000);
    const ready = join(output, 'diagnostics', family.name, 'before-ui-test.png');
    mkdirSync(dirname(ready), { recursive: true });
    run('xcrun', ['simctl', 'io', device, 'screenshot', ready]);
    const result = join(temporary, `${family.name}.xcresult`);
    const argumentsForBuild = [
      '-project',
      project,
      '-scheme',
      'AppStoreScreenshots',
      '-configuration',
      'Debug',
      '-destination',
      `id=${device}`,
      '-derivedDataPath',
      join(temporary, 'build'),
      '-parallel-testing-enabled',
      'NO',
      'CODE_SIGNING_ALLOWED=NO',
    ];
    if (!built) {
      run('xcodebuild', [...argumentsForBuild, 'build-for-testing']);
      built = true;
    }
    try {
      run('xcodebuild', [
        ...argumentsForBuild,
        '-resultBundlePath',
        result,
        'test-without-building',
      ]);
    } finally {
      // Keep diagnostics if navigation fails; never present incomplete captures as ready.
      const exported = join(output, 'diagnostics', family.name);
      run(
        'xcrun',
        ['xcresulttool', 'export', 'attachments', '--path', result, '--output-path', exported],
        { optional: true },
      );
      const systemLog = run(
        'xcrun',
        [
          'simctl',
          'spawn',
          device,
          'log',
          'show',
          '--last',
          '3m',
          '--style',
          'compact',
          '--predicate',
          'process == "案笺"',
        ],
        { capture: true, optional: true },
      );
      if (systemLog) writeFileSync(join(exported, 'app-system.log'), systemLog);
    }
    const exported = join(output, 'diagnostics', family.name);
    const manifest = JSON.parse(readFileSync(join(exported, 'manifest.json'), 'utf8'));
    const shots = [];
    function collect(value) {
      if (!value || typeof value !== 'object') return;
      if (
        typeof value.exportedFileName === 'string' &&
        typeof value.suggestedHumanReadableName === 'string'
      ) {
        const name = value.suggestedHumanReadableName.match(/anjian-(0[1-4]-[a-z-]+)/)?.[1];
        if (name) {
          const path = resolve(exported, value.exportedFileName);
          if (!path.startsWith(resolve(exported) + '/')) throw new Error('Invalid attachment path');
          const bytes = readFileSync(path);
          if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            throw new Error('Not a PNG screenshot');
          const size = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
          if (size.some((n, i) => n !== family.size[i]))
            throw new Error(`Unexpected screenshot dimensions: ${size}`);
          const destination = join(output, 'screenshots', family.name, `${name}.png`);
          mkdirSync(dirname(destination), { recursive: true });
          run(exportPng, [path, destination]);
          shots.push({ file: `${name}.png`, width: size[0], height: size[1] });
        }
      }
      for (const child of Object.values(value)) if (typeof child === 'object') collect(child);
    }
    collect(manifest);
    if (new Set(shots.map((item) => item.file)).size !== 4)
      throw new Error('Expected four verified native screenshots per device');
    report.devices.push({
      family: family.name,
      model: family.model.name,
      runtime: runtime.version,
      screenshots: shots,
    });
    run('xcrun', ['simctl', 'terminate', device, bundle], { optional: true });
    run('xcrun', ['simctl', 'shutdown', device]);
  }
  run('node', [join(root, 'scripts/package-app-store.mjs'), output]);
  run(exportPng, [
    join(root, 'src-tauri/icons/ios/AppIcon-512@2x.png'),
    join(output, 'reference/app-icon-1024.png'),
  ]);
  report.status = 'captured-needs-visual-review';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  writeFileSync(join(output, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const device of devices) {
    run('xcrun', ['simctl', 'shutdown', device], { optional: true });
    run('xcrun', ['simctl', 'delete', device], { optional: true });
  }
  rmSync(temporary, { recursive: true, force: true });
}
