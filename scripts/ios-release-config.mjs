import { createPrivateKey } from 'node:crypto';

export function releaseSettings(env, projectTeam) {
  env = { ...env, APPLE_DEVELOPMENT_TEAM: env.APPLE_DEVELOPMENT_TEAM?.trim() || projectTeam };
  const required = [
    'APPLE_DEVELOPMENT_TEAM',
    'APPLE_API_KEY',
    'APPLE_API_ISSUER',
    'APPLE_API_PRIVATE_KEY',
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing iOS signing configuration: ${missing.join(', ')}`);
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_DEVELOPMENT_TEAM)) throw new Error('Invalid Apple Team ID');
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_API_KEY))
    throw new Error('Invalid App Store Connect Key ID');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.APPLE_API_ISSUER))
    throw new Error('Invalid App Store Connect Issuer ID');
  let privateKey;
  try {
    privateKey = createPrivateKey(env.APPLE_API_PRIVATE_KEY);
  } catch {
    throw new Error('App Store Connect private key is not a valid unencrypted P-256 PEM key');
  }
  if (
    privateKey.asymmetricKeyType !== 'ec' ||
    privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
  )
    throw new Error('App Store Connect private key must use P-256');

  const buildNumber =
    env.IOS_BUILD_NUMBER?.trim() || `${env.GITHUB_RUN_NUMBER}.${env.GITHUB_RUN_ATTEMPT}`;
  if (!/^\d{1,4}(?:\.\d{1,2}){0,2}$/.test(buildNumber) || Number(buildNumber.split('.')[0]) < 1)
    throw new Error('Build number must have 1–3 numeric components (first 1–9999, others 0–99)');
  if (!['true', 'false'].includes(env.IOS_UPLOAD_TO_TESTFLIGHT ?? 'false'))
    throw new Error('IOS_UPLOAD_TO_TESTFLIGHT must be true or false');
  const manual = ['IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_MOBILE_PROVISION'];
  const configured = manual.filter((name) => env[name]);
  if (configured.length && configured.length !== manual.length)
    throw new Error(
      'Manual signing requires IOS_CERTIFICATE, IOS_CERTIFICATE_PASSWORD and IOS_MOBILE_PROVISION together',
    );
  return {
    team: env.APPLE_DEVELOPMENT_TEAM,
    keyId: env.APPLE_API_KEY,
    issuer: env.APPLE_API_ISSUER,
    buildNumber,
    upload: env.IOS_UPLOAD_TO_TESTFLIGHT === 'true',
  };
}

// Tauri gives even an empty environment value precedence over project config.
// Pass the validated values to every child process, then remove the raw key.
export function configureAppleEnvironment(env, settings, keyPath, keyDirectory) {
  env.APPLE_DEVELOPMENT_TEAM = settings.team;
  env.APPLE_API_KEY = settings.keyId;
  env.APPLE_API_ISSUER = settings.issuer;
  env.APPLE_API_KEY_PATH = keyPath;
  env.API_PRIVATE_KEYS_DIR = keyDirectory;
  delete env.APPLE_API_PRIVATE_KEY;
  for (const name of ['IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_MOBILE_PROVISION']) {
    if (!env[name]) delete env[name];
  }
}

// App Store Connect has required Xcode/iOS SDK 26+ since April 28, 2026.
export function checkSubmissionToolchain(xcode, sdk) {
  const xcodeMajor = Number(/^Xcode (\d+)/m.exec(xcode)?.[1]);
  const sdkMajor = Number(/^(\d+)(?:\.|$)/.exec(sdk.trim())?.[1]);
  if (
    !Number.isFinite(xcodeMajor) ||
    !Number.isFinite(sdkMajor) ||
    xcodeMajor < 26 ||
    sdkMajor < 26
  )
    throw new Error('App Store submissions require Xcode 26+ and the iOS 26+ SDK');
}
