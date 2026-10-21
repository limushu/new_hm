import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Runs the production Swift driver inside a scene-based iOS XCTest host. This
// creates only a CI-owned app/device; no production test command is registered.
const root = resolve(import.meta.dirname, '..');
const device = process.argv[2];
if (process.platform !== 'darwin' || !device)
  throw new Error('Requires macOS and a booted CI simulator ID');
const temporary = mkdtempSync(join(tmpdir(), 'hm-recording-tests-'));
const output = join(root, 'artifacts/ios/simulator');
mkdirSync(output, { recursive: true });
function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: temporary, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw new Error(`${binary} native recording test failed: ${result.status}`);
}
try {
  const spec = {
    name: 'RecordingDriverRegression',
    options: { deploymentTarget: { iOS: '15.0' } },
    packages: { Tauri: { path: join(root, 'crates/tauri-plugin-hm-recording/.tauri/tauri-api') } },
    settings: { base: { SWIFT_VERSION: '5.0', CODE_SIGNING_ALLOWED: 'NO' } },
    targets: {
      RecordingHost: {
        type: 'application',
        platform: 'iOS',
        sources: [join(root, 'tests/native/ios-recording/Host.swift')],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.recordingtests',
            TARGETED_DEVICE_FAMILY: '1',
          },
        },
        info: {
          path: 'Host-Info.plist',
          properties: {
            NSMicrophoneUsageDescription: 'Native recording regression test',
            UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false },
            UILaunchScreen: {},
          },
        },
      },
      RecordingTests: {
        type: 'bundle.unit-test',
        platform: 'iOS',
        sources: [
          join(root, 'crates/tauri-plugin-hm-recording/ios/Sources'),
          join(root, 'tests/native/ios-recording/RecordingTests.swift'),
        ],
        dependencies: [{ target: 'RecordingHost' }, { package: 'Tauri' }],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.recordingtests.tests',
            GENERATE_INFOPLIST_FILE: 'YES',
            TEST_HOST: '$(BUILT_PRODUCTS_DIR)/RecordingHost.app/RecordingHost',
            BUNDLE_LOADER: '$(TEST_HOST)',
          },
        },
      },
    },
    schemes: {
      RecordingDriverRegression: {
        build: { targets: { RecordingHost: 'all', RecordingTests: ['test'] } },
        test: { targets: ['RecordingTests'] },
      },
    },
  };
  writeFileSync(join(temporary, 'project.json'), JSON.stringify(spec, null, 2));
  run('xcodegen', ['generate', '--spec', join(temporary, 'project.json')]);
  const argumentsForBuild = [
    '-project',
    join(temporary, 'RecordingDriverRegression.xcodeproj'),
    '-scheme',
    'RecordingDriverRegression',
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
  run('xcodebuild', [...argumentsForBuild, 'build-for-testing']);
  run('xcrun', [
    'simctl',
    'install',
    device,
    join(temporary, 'build/Build/Products/Debug-iphonesimulator/RecordingHost.app'),
  ]);
  run('xcrun', [
    'simctl',
    'privacy',
    device,
    'grant',
    'microphone',
    'com.limushu.hm.recordingtests',
  ]);
  run('xcodebuild', [
    ...argumentsForBuild,
    '-resultBundlePath',
    join(output, 'native-recording.xcresult'),
    'test-without-building',
  ]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
