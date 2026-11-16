import { generateKeyPairSync, verify } from 'node:crypto';
import { expect, test } from 'vitest';
import { appStoreToken, testFlightStatus } from './ios-testflight-status.mjs';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const credentials = {
  keyId: 'KEY1234567',
  issuer: '00000000-0000-0000-0000-000000000001',
  privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const candidate = { bundleId: 'com.example.app', version: '1.7.7', buildNumber: '29.1' };
const build = (version, state = 'VALID') => ({
  data: [
    {
      id: 'build-1',
      attributes: { version: '29.1', processingState: state },
      relationships: { preReleaseVersion: { data: { id: 'release-1' } } },
    },
  ],
  included: [{ type: 'preReleaseVersions', id: 'release-1', attributes: { version } }],
});
const response = (body) => new Response(JSON.stringify(body));
test('status JWT has a short expiry and a valid App Store audience/signature', () => {
  const [header, payload, signature] = appStoreToken(credentials, 1000000).split('.');
  expect(JSON.parse(Buffer.from(payload, 'base64url'))).toEqual({
    iss: credentials.issuer,
    iat: 1000,
    exp: 1600,
    aud: 'appstoreconnect-v1',
  });
  expect(
    verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: keys.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    ),
  ).toBe(true);
});
test('processing and distribution are separate, and a different app version cannot count as this build', async () => {
  let calls = 0;
  let waits = 0;
  const result = await testFlightStatus(credentials, candidate, {
    fetch: async (url) => {
      if (url.includes('/apps?')) return response({ data: [{ id: 'app-1' }] });
      if (url.endsWith('/buildBetaDetail'))
        return response({ data: { attributes: { internalBuildState: 'IN_BETA_TESTING' } } });
      calls++;
      return response(
        calls === 1 ? build('1.4.3') : calls === 2 ? build('1.7.7', 'PROCESSING') : build('1.7.7'),
      );
    },
    wait: async () => {
      waits++;
    },
    attempts: 3,
  });
  expect(calls).toBe(3);
  expect(waits).toBe(2);
  expect(result).toEqual({
    buildId: 'build-1',
    processingState: 'VALID',
    internalBuildState: 'IN_BETA_TESTING',
    readyForInternalTesting: true,
  });
});
test('API errors cannot echo response bodies or auth tokens into release artifacts', async () => {
  const result = await testFlightStatus(credentials, candidate, {
    fetch: async () => new Response('private-body-value', { status: 403 }),
    attempts: 1,
  });
  expect(result.readyForInternalTesting).toBe(false);
  expect(result.inspectionError).toContain('HTTP 403');
  expect(JSON.stringify(result)).not.toContain('private-body-value');
  expect(JSON.stringify(result)).not.toContain('Bearer');
});
test('rejected builds and pending distribution are never reported as available', async () => {
  for (const state of ['INVALID', 'VALID']) {
    const result = await testFlightStatus(credentials, candidate, {
      fetch: async (url) => {
        if (url.includes('/apps?')) return response({ data: [{ id: 'app-1' }] });
        if (url.endsWith('/buildBetaDetail'))
          return response({
            data: { attributes: { internalBuildState: 'READY_FOR_BETA_TESTING' } },
          });
        return response(build('1.7.7', state));
      },
      attempts: 1,
    });
    expect(result.readyForInternalTesting).toBe(false);
    expect(result.processingState).toBe(state);
  }
});
