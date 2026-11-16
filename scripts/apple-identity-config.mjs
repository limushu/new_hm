import { createPrivateKey, sign } from 'node:crypto';

/** Private values are consumed by the deployment process, never printed or bundled. */
export function appleIdentityConfiguration(
  { teamId, keyId, clientId, privateKey },
  now = Date.now(),
) {
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '') || !/^[A-Z0-9]{10}$/.test(keyId ?? ''))
    throw new Error('Apple Team ID and Sign in with Apple Key ID must each have 10 characters');
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$/.test(clientId ?? '') || !clientId.includes('.'))
    throw new Error('Configure the Apple Services ID, not an App Store Connect API key');
  let key;
  try {
    key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      throw new Error('wrong curve');
  } catch {
    throw new Error('Sign in with Apple private key must be a valid P-256 .p8 key');
  }
  const issued = Math.floor(now / 1000);
  const expires = issued + 150 * 24 * 60 * 60; // Below Apple's six-month maximum.
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: teamId, iat: issued, exp: expires, aud: 'https://appleid.apple.com', sub: clientId })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return {
    authPatch: {
      external_apple_enabled: true,
      external_apple_client_id: clientId,
      external_apple_secret: `${unsigned}.${signature.toString('base64url')}`,
    },
    functionSecrets: [
      { name: 'APPLE_KEY_ID', value: keyId },
      { name: 'APPLE_TEAM_ID', value: teamId },
      { name: 'APPLE_OAUTH_CLIENT_ID', value: clientId },
      { name: 'APPLE_PRIVATE_KEY', value: privateKey },
    ],
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}
