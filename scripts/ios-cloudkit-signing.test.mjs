import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cloudEntitlementsValid,
  cloudProjectTemplate,
  verifyCloudSchema,
} from './ios-cloudkit-signing.mjs';
describe('CloudKit release gate', () => {
  it('requires the exact production container, service and environment', () => {
    const good = {
      'com.apple.developer.icloud-container-identifiers': ['iCloud.com.limushu.hm'],
      'com.apple.developer.icloud-services': ['CloudKit'],
      'com.apple.developer.icloud-container-environment': 'Production',
    };
    expect(cloudEntitlementsValid(good)).toBe(true);
    for (const key of Object.keys(good))
      expect(cloudEntitlementsValid({ ...good, [key]: undefined })).toBeFalsy();
    expect(
      cloudEntitlementsValid({
        ...good,
        'com.apple.developer.icloud-container-environment': 'Development',
      }),
    ).toBe(false);
  });
  it('activates only a generated signed-build template, leaving simulator defaults local', () => {
    const original = readFileSync(new URL('../src-tauri/ios-project.yml', import.meta.url), 'utf8');
    expect(original).not.toContain('AnjianCloudKitContainer');
    const release = cloudProjectTemplate(original);
    expect(release).toContain('AnjianCloudKitContainer: iCloud.com.limushu.hm');
    expect(release).toContain('com.apple.developer.icloud-container-environment: Production');
    expect(() => cloudProjectTemplate('unrecognized template')).toThrow();
  });
  it('refuses uploads when any production record or field type is missing', () => {
    const schema = readFileSync(new URL('../cloudkit/schema.ckdb', import.meta.url), 'utf8');
    expect(() => verifyCloudSchema(schema)).not.toThrow();
    expect(() => verifyCloudSchema(schema.replace('data ASSET', 'data STRING'))).toThrow();
    expect(() => verifyCloudSchema(schema.replace('AnjianSyncHead', 'OtherHead'))).toThrow();
  });
});

it('selects the exact App ID from prefix matches and does not pass unsupported relationship pagination', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { cloudSigning } = await import('./ios-cloudkit-signing.mjs');
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const calls = [];
  const result = await cloudSigning(
    { keyId: 'ABCDEFGHIJ', issuer: '00000000-0000-0000-0000-000000000001', privateKey },
    {
      fetch: async (url) => {
        calls.push(url);
        if (url.includes('/bundleIdCapabilities')) {
          expect(url).toBe(
            'https://api.appstoreconnect.apple.com/v1/bundleIds/app-id/bundleIdCapabilities',
          );
          return new Response(
            JSON.stringify({ data: [{ attributes: { capabilityType: 'ICLOUD' } }] }),
          );
        }
        return new Response(
          JSON.stringify({
            data: [
              { id: 'service', attributes: { identifier: 'com.limushu.hm.auth' } },
              { id: 'app-id', attributes: { identifier: 'com.limushu.hm' } },
            ],
          }),
        );
      },
    },
  );
  expect(result).toEqual({ capability: 'ICLOUD', profileReady: false, automaticSigning: true });
  expect(calls).toHaveLength(2);
});
