import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
  // The plugin builder prunes Tests from its .tauri API copy. Xcode's resolver
  // validates that declared target, so use Cargo's complete resolved SDK.
  const metadata = spawnSync(
    'cargo',
    [
      'metadata',
      '--locked',
      '--offline',
      '--format-version',
      '1',
      '--filter-platform',
      process.arch === 'arm64' ? 'aarch64-apple-ios-sim' : 'x86_64-apple-ios',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (metadata.error || metadata.status !== 0)
    throw new Error(
      `Cannot locate resolved Tauri SDK: ${metadata.error?.message ?? metadata.stderr}`,
    );
  const tauri = JSON.parse(metadata.stdout).packages.find((item) => item.name === 'tauri');
  if (!tauri) throw new Error('Resolved Tauri SDK is missing');
  const tauriPackage = join(temporary, 'Tauri');
  cpSync(join(dirname(tauri.manifest_path), 'mobile/ios-api'), tauriPackage, { recursive: true });
  const spec = {
    name: 'RecordingDriverRegression',
    options: { deploymentTarget: { iOS: '15.0' } },
    packages: { Tauri: { path: tauriPackage } },
    // Simulator signing needs no distribution certificate. Let Xcode sign the
    // host, injected test bundle and libraries together, including entitlements.
    settings: {
      base: {
        SWIFT_VERSION: '5.0',
        CODE_SIGNING_ALLOWED: 'YES',
        CODE_SIGN_IDENTITY: '-',
        CODE_SIGN_STYLE: 'Manual',
        ENABLE_DEBUG_DYLIB: 'NO',
      },
    },
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
        entitlements: {
          path: 'Host-Test.entitlements',
          properties: {
            'application-identifier': 'HMTEST0000.com.limushu.hm.recordingtests',
            'com.apple.developer.team-identifier': 'HMTEST0000',
            'keychain-access-groups': ['HMTEST0000.com.limushu.hm.recordingtests'],
            'get-task-allow': true,
          },
        },
        info: {
          path: 'Host-Info.plist',
          properties: {
            NSMicrophoneUsageDescription: 'Native recording regression test',
            NSSpeechRecognitionUsageDescription: 'Native on-device speech regression test',
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
          join(root, 'crates/tauri-plugin-hm-documents/ios/Sources'),
          join(root, 'crates/tauri-plugin-hm-speech/ios/Sources'),
          join(root, 'crates/tauri-plugin-hm-cloudkit/ios/Sources'),
          join(root, 'crates/tauri-plugin-hm-identity/ios/Sources'),
          join(root, 'crates/tauri-plugin-hm-agenda/ios/Sources'),
          join(root, 'crates/tauri-plugin-hm-host/ios/Sources'),
          join(root, 'tests/native/ios-recording/RecordingTests.swift'),
          join(root, 'tests/native/ios-recording/DocumentsTests.swift'),
          join(root, 'tests/native/ios-recording/SpeechTests.swift'),
          join(root, 'tests/native/ios-recording/CloudKitTests.swift'),
          join(root, 'tests/native/ios-recording/IdentityTests.swift'),
          join(root, 'tests/native/ios-recording/AgendaTests.swift'),
          join(root, 'tests/native/ios-recording/HostAppearanceTests.swift'),
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
    `id=${device},arch=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`,
    '-derivedDataPath',
    join(temporary, 'build'),
    '-parallel-testing-enabled',
    'NO',
    'CODE_SIGNING_ALLOWED=YES',
    'CODE_SIGN_IDENTITY=-',
  ];
  run('xcodebuild', [...argumentsForBuild, 'build-for-testing']);
  // Verify the complete build signature before installation; post-signing only
  // the app executable leaves test bundles and debug libraries inconsistent.
  const host = join(temporary, 'build/Build/Products/Debug-iphonesimulator/RecordingHost.app');
  run('codesign', ['--verify', '--deep', '--strict', host]);
  run('xcrun', ['simctl', 'install', device, host]);
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
    '-test-timeouts-enabled',
    'YES',
    '-default-test-execution-time-allowance',
    '45',
    '-maximum-test-execution-time-allowance',
    '90',
    '-resultBundlePath',
    join(output, 'native-recording.xcresult'),
    'test-without-building',
  ]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
