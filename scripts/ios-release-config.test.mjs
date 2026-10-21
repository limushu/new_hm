import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  releaseSettings,
  configureAppleEnvironment,
  checkSubmissionToolchain,
} from './ios-release-config.mjs';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const env = {
  APPLE_DEVELOPMENT_TEAM: 'ABCDE12345',
  APPLE_API_KEY: 'FGHIJ67890',
  APPLE_API_ISSUER: '00000000-0000-0000-0000-000000000001',
  APPLE_API_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  GITHUB_RUN_NUMBER: '12',
  GITHUB_RUN_ATTEMPT: '3',
};
test('archive defaults to no upload and reruns produce a new valid build number', () => {
  const result = releaseSettings(env);
  assert.equal(result.upload, false);
  assert.equal(result.buildNumber, '12.3');
  assert.equal(releaseSettings({ ...env, GITHUB_RUN_ATTEMPT: '4' }).buildNumber, '12.4');
  assert.ok(!Object.values(result).includes(env.APPLE_API_PRIVATE_KEY));
});
test('rejects missing and malformed signing inputs without echoing private key material', () => {
  assert.throws(
    () => releaseSettings({ ...env, APPLE_API_PRIVATE_KEY: '' }),
    /Missing.*APPLE_API_PRIVATE_KEY/,
  );
  assert.throws(
    () => releaseSettings({ ...env, APPLE_DEVELOPMENT_TEAM: 'invalid' }),
    /Invalid Apple Team/,
  );
  assert.throws(
    () => releaseSettings({ ...env, APPLE_API_PRIVATE_KEY: 'PRIVATE-TEST-VALUE' }),
    (error) => !error.message.includes('PRIVATE-TEST-VALUE'),
  );
});
test('rejects invalid Apple build versions and ambiguous upload requests', () => {
  for (const build of ['1.2.3.4', '10000.1', '0.1', '1.100', '1\n2'])
    assert.throws(() => releaseSettings({ ...env, IOS_BUILD_NUMBER: build }), /Build number/);
  assert.throws(
    () => releaseSettings({ ...env, IOS_UPLOAD_TO_TESTFLIGHT: 'yes' }),
    /must be true or false/,
  );
  assert.equal(
    releaseSettings({ ...env, IOS_BUILD_NUMBER: '2026.10.20', IOS_UPLOAD_TO_TESTFLIGHT: 'true' })
      .upload,
    true,
  );
});
test('manual certificate fallback cannot run with a partial credential set', () => {
  assert.throws(
    () => releaseSettings({ ...env, IOS_CERTIFICATE: 'encrypted-fixture' }),
    /Manual signing requires/,
  );
});

test('project Team ID is used by default and an explicit environment value overrides it', () => {
  const withoutTeam = { ...env, APPLE_DEVELOPMENT_TEAM: '' };
  assert.equal(releaseSettings(withoutTeam, 'UN356US9WL').team, 'UN356US9WL');
  assert.equal(releaseSettings(env, 'UN356US9WL').team, env.APPLE_DEVELOPMENT_TEAM);
  assert.throws(() => releaseSettings(withoutTeam, 'invalid'), /Invalid Apple Team/);
});

test('empty workflow Team variable cannot override the validated project fallback in Tauri', () => {
  const child = { ...env, APPLE_DEVELOPMENT_TEAM: '' };
  const settings = releaseSettings(child, 'UN356US9WL');
  configureAppleEnvironment(child, settings, '/private/AuthKey_test.p8', '/private');
  assert.equal(child.APPLE_DEVELOPMENT_TEAM, 'UN356US9WL');
  assert.equal(child.APPLE_API_KEY_PATH, '/private/AuthKey_test.p8');
  assert.equal(child.API_PRIVATE_KEYS_DIR, '/private');
  assert.ok(!Object.hasOwn(child, 'APPLE_API_PRIVATE_KEY'));
});

test('unset optional signing secrets are absent, not empty values that activate manual signing', () => {
  const child = {
    ...env,
    IOS_CERTIFICATE: '',
    IOS_CERTIFICATE_PASSWORD: '',
    IOS_MOBILE_PROVISION: '',
  };
  configureAppleEnvironment(child, releaseSettings(child), '/private/key.p8', '/private');
  for (const name of ['IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_MOBILE_PROVISION'])
    assert.ok(!Object.hasOwn(child, name));
});
test('an explicitly supplied manual-signing set remains available to Tauri', () => {
  const child = {
    ...env,
    IOS_CERTIFICATE: 'certificate-fixture',
    IOS_CERTIFICATE_PASSWORD: 'password-fixture',
    IOS_MOBILE_PROVISION: 'profile-fixture',
  };
  configureAppleEnvironment(child, releaseSettings(child), '/private/key.p8', '/private');
  assert.equal(child.IOS_CERTIFICATE, 'certificate-fixture');
  assert.equal(child.IOS_CERTIFICATE_PASSWORD, 'password-fixture');
  assert.equal(child.IOS_MOBILE_PROVISION, 'profile-fixture');
});

test('submission rejects obsolete or unrecognized Xcode and iOS SDK versions before building', () => {
  assert.throws(
    () => checkSubmissionToolchain('Xcode 16.4\nBuild version 16F6', '18.5'),
    /Xcode 26/,
  );
  assert.throws(() => checkSubmissionToolchain('Xcode 26.2', '18.5'), /iOS 26/);
  assert.throws(() => checkSubmissionToolchain('unknown', '26.2'), /Xcode 26/);
  assert.doesNotThrow(() => checkSubmissionToolchain('Xcode 26.2\nBuild version 17C1', '26.2'));
  assert.doesNotThrow(() => checkSubmissionToolchain('Xcode 27.0', '27.0'));
});
