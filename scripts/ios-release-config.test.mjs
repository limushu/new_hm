import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { releaseSettings } from './ios-release-config.mjs';

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
