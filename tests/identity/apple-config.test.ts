import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Deployment script is intentionally dependency-free ESM.
import { appleIdentityConfiguration } from '../../scripts/apple-identity-config.mjs';

describe('Apple OAuth deployment configuration', () => {
  it('signs a bounded Services ID JWT and uses the same identity for account revocation', () => {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const result = appleIdentityConfiguration(
      { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'com.example.case.auth', privateKey },
      Date.parse('2026-11-16T00:00:00Z'),
    );
    const [header, payload, signature] = result.authPatch.external_apple_secret.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims.sub).toBe('com.example.case.auth');
    expect(claims.iss).toBe('TEAM123456');
    expect(claims.aud).toBe('https://appleid.apple.com');
    expect(claims.exp - claims.iat).toBe(150 * 86400);
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: keys.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
    expect(
      result.functionSecrets.find((s: { name: string }) => s.name === 'APPLE_OAUTH_CLIENT_ID')
        ?.value,
    ).toBe(claims.sub);
    expect(
      result.functionSecrets.find((s: { name: string }) => s.name === 'APPLE_PRIVATE_KEY')?.value,
    ).toBe(privateKey);
  });
  it('rejects malformed IDs and signing keys without echoing private input', () => {
    expect(() =>
      appleIdentityConfiguration({
        teamId: 'short',
        keyId: 'KEY1234567',
        clientId: 'com.example.auth',
        privateKey: 'private-test-value',
      }),
    ).toThrow(/10 characters/);
    try {
      appleIdentityConfiguration({
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        clientId: 'com.example.auth',
        privateKey: 'private-test-value',
      });
      throw new Error('must fail');
    } catch (error) {
      expect(String(error)).not.toContain('private-test-value');
      expect(String(error)).toContain('P-256');
    }
  });
});
