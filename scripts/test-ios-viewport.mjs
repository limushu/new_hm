import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const device = process.argv[2];
if (process.platform !== 'darwin' || !device) throw new Error('Requires the CI iOS simulator');
const temporary = mkdtempSync(join(tmpdir(), 'hm-viewport-tests-'));
const output = join(root, 'artifacts/ios/simulator');
mkdirSync(output, { recursive: true });
function run(binary, args, optional = false) {
  const result = spawnSync(binary, args, { cwd: temporary, stdio: 'inherit' });
  if (!optional && (result.error || result.status !== 0))
    throw new Error(`${binary} native viewport test failed: ${result.status}`);
}
const resultBundle = join(output, 'viewport.xcresult');
try {
  const spec = {
    name: 'ViewportRegression',
    options: { deploymentTarget: { iOS: '15.0' } },
    settings: { base: { SWIFT_VERSION: '5.0', CODE_SIGNING_ALLOWED: 'NO' } },
    targets: {
      ViewportHost: {
        type: 'application',
        platform: 'iOS',
        sources: [join(root, 'tests/native/ios-recording/Host.swift')],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.viewporttests',
            TARGETED_DEVICE_FAMILY: '1',
          },
        },
        info: {
          path: 'Host-Info.plist',
          properties: {
            UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false },
            UILaunchScreen: {},
          },
        },
      },
      ViewportTests: {
        type: 'bundle.ui-testing',
        platform: 'iOS',
        sources: [join(root, 'tests/native/ios-viewport/ViewportTests.swift')],
        dependencies: [{ target: 'ViewportHost' }],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.limushu.hm.viewporttests.tests',
            GENERATE_INFOPLIST_FILE: 'YES',
            TEST_TARGET_NAME: 'ViewportHost',
            TARGETED_DEVICE_FAMILY: '1',
          },
        },
      },
    },
    schemes: {
      ViewportRegression: {
        build: { targets: { ViewportTests: ['test'] } },
        test: { targets: ['ViewportTests'] },
      },
    },
  };
  writeFileSync(join(temporary, 'project.json'), JSON.stringify(spec, null, 2));
  run('xcodegen', ['generate', '--spec', join(temporary, 'project.json')]);
  spawnSync('killall', ['Simulator'], { stdio: 'ignore' });
  run('defaults', [
    'write',
    'com.apple.iphonesimulator',
    'ConnectHardwareKeyboard',
    '-bool',
    'false',
  ]);
  run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device]);
  await delay(3000);
  const args = [
    '-project',
    join(temporary, 'ViewportRegression.xcodeproj'),
    '-scheme',
    'ViewportRegression',
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
  run('xcodebuild', [...args, 'build-for-testing']);
  run('xcodebuild', [
    ...args,
    '-test-timeouts-enabled',
    'YES',
    '-default-test-execution-time-allowance',
    '120',
    '-maximum-test-execution-time-allowance',
    '180',
    '-resultBundlePath',
    resultBundle,
    'test-without-building',
  ]);
} finally {
  const attachments = join(output, 'viewport-attachments');
  run(
    'xcrun',
    ['xcresulttool', 'export', 'attachments', '--path', resultBundle, '--output-path', attachments],
    true,
  );
  try {
    const manifest = JSON.parse(readFileSync(join(attachments, 'manifest.json'), 'utf8'));
    function collect(value) {
      if (!value || typeof value !== 'object') return;
      const name = value.suggestedHumanReadableName?.match(/anjian-viewport-([\w-]+)/)?.[1];
      if (name && typeof value.exportedFileName === 'string') {
        const source = resolve(attachments, value.exportedFileName);
        if (!source.startsWith(resolve(attachments) + '/'))
          throw new Error('Invalid screenshot attachment');
        cpSync(source, join(output, `viewport-${name}.png`));
      }
      Object.values(value).forEach(collect);
    }
    collect(manifest);
  } catch (error) {
    console.warn(`Viewport attachments unavailable: ${error}`);
  }
  rmSync(temporary, { recursive: true, force: true });
}
