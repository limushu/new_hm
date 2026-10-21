import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  releaseSettings,
  configureAppleEnvironment,
  checkSubmissionToolchain,
} from './ios-release-config.mjs';

if (process.platform !== 'darwin') throw new Error('iOS distribution requires macOS and Xcode');
const root = resolve(import.meta.dirname, '..');
const project = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.ios.conf.json'), 'utf8'));
const settings = releaseSettings(process.env, project.bundle.iOS.developmentTeam);
const output = join(root, 'artifacts/ios/testflight');
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(process.env.RUNNER_TEMP ?? '/tmp', 'anjian-ios-signing-'));
const report = {
  source: process.env.IOS_SOURCE_SHA ?? 'local',
  buildNumber: settings.buildNumber,
  upload: 'not-requested',
  status: 'started',
};

function run(binary, args, capture = false) {
  const result = spawnSync(binary, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${binary} failed (${result.status}): ${result.error?.message ?? result.stderr ?? ''}`,
    );
  return result.stdout?.trim() ?? '';
}
function findIpas(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isFile() && entry.name.endsWith('.ipa')
      ? [path]
      : entry.isDirectory() && !entry.name.endsWith('.xcarchive') && !entry.name.endsWith('.app')
        ? findIpas(path)
        : [];
  });
}

try {
  const keyPath = join(temporary, `AuthKey_${settings.keyId}.p8`);
  writeFileSync(keyPath, process.env.APPLE_API_PRIVATE_KEY, { mode: 0o600 });
  configureAppleEnvironment(process.env, settings, keyPath, temporary);
  const configPath = join(temporary, 'ios-release.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      bundle: { iOS: { developmentTeam: settings.team, bundleVersion: settings.buildNumber } },
    }),
    { mode: 0o600 },
  );
  report.xcode = run('xcodebuild', ['-version'], true);
  report.sdk = run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], true);
  checkSubmissionToolchain(report.xcode, report.sdk);
  run('npx', ['tauri', 'ios', 'init', '--ci', '--skip-targets-install', '--config', configPath]);
  run('npx', [
    'tauri',
    'ios',
    'build',
    '--ci',
    '--target',
    'aarch64',
    '--export-method',
    'app-store-connect',
    '--config',
    configPath,
  ]);
  const ipas = findIpas(join(root, 'src-tauri/gen/apple'));
  if (ipas.length !== 1) throw new Error(`Expected one exported IPA, found ${ipas.length}`);
  const unpacked = join(temporary, 'unpacked');
  run('ditto', ['-x', '-k', ipas[0], unpacked]);
  const apps = readdirSync(join(unpacked, 'Payload')).filter((name) => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('IPA must contain exactly one application');
  const app = join(unpacked, 'Payload', apps[0]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const signing = spawnSync('codesign', ['-d', '--verbose=4', app], { encoding: 'utf8' });
  if (signing.status !== 0 || !signing.stderr.includes(`TeamIdentifier=${settings.team}`))
    throw new Error('IPA signature does not match the configured Apple Team');
  const plist = (key) =>
    run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(app, 'Info.plist')], true);
  if (plist('CFBundleIdentifier') !== 'com.limushu.hm')
    throw new Error('Unexpected IPA bundle identifier');
  if (plist('CFBundleVersion') !== settings.buildNumber)
    throw new Error('Exported IPA build number does not match the requested build');
  report.version = plist('CFBundleShortVersionString');
  const entitlements = spawnSync('codesign', ['-d', '--entitlements', ':-', app], {
    encoding: 'utf8',
  });
  const entitlementCheck = spawnSync(
    'python3',
    [
      '-c',
      'import plistlib,sys; p=plistlib.loads(sys.stdin.buffer.read()); assert not p.get("get-task-allow",False); assert p.get("application-identifier", "").endswith(".com.limushu.hm")',
    ],
    { input: entitlements.stdout, encoding: 'utf8' },
  );
  if (entitlements.status !== 0 || entitlementCheck.status !== 0)
    throw new Error('IPA does not have distribution entitlements for this app');
  const destination = join(output, 'anjian-testflight.ipa');
  copyFileSync(ipas[0], destination);
  report.status = 'signed-and-verified';
  if (settings.upload) {
    run('xcrun', [
      'altool',
      '--upload-app',
      '--type',
      'ios',
      '--file',
      destination,
      '--apiKey',
      settings.keyId,
      '--apiIssuer',
      settings.issuer,
    ]);
    report.upload = 'accepted-for-processing';
  }
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  writeFileSync(join(output, 'build-info.json'), JSON.stringify(report, null, 2) + '\n');
  rmSync(temporary, { recursive: true, force: true });
}
