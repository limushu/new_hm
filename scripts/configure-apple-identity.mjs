import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectIdentityConfig } from './identity-config.mjs';
import { identityAuthPatch } from './identity-auth-config.mjs';
import { appleIdentityConfiguration } from './apple-identity-config.mjs';

if (!process.argv.includes('--apply')) {
  console.log(
    'Dry run: Apple provider and deletion credentials only; no private values are printed.',
  );
} else {
  const names = [
    'SUPABASE_ACCESS_TOKEN',
    'APPLE_SIGN_IN_TEAM_ID',
    'APPLE_SIGN_IN_KEY_ID',
    'APPLE_SIGN_IN_CLIENT_ID',
    'APPLE_SIGN_IN_PRIVATE_KEY',
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Configure GitHub Secrets: ${missing.join(', ')}`);
  const config = projectIdentityConfig(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../supabase/client.public.json'), 'utf8'),
    ),
  );
  const apple = appleIdentityConfiguration({
    teamId: process.env.APPLE_SIGN_IN_TEAM_ID,
    keyId: process.env.APPLE_SIGN_IN_KEY_ID,
    clientId: process.env.APPLE_SIGN_IN_CLIENT_ID,
    privateKey: process.env.APPLE_SIGN_IN_PRIVATE_KEY,
  });
  const root = `https://api.supabase.com/v1/projects/${config.projectRef}`;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`${root}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(`Apple configuration request failed (HTTP ${response.status})`);
    // Raw configuration may include secrets. Never log it or an error response body.
    return response;
  };
  const current = await (await request('/config/auth')).json();
  if (
    current.external_apple_client_id &&
    current.external_apple_client_id !== apple.authPatch.external_apple_client_id
  )
    throw new Error(
      'An existing Apple client ID differs; preserve it and review configuration manually',
    );
  // Install deletion/revocation credentials before enabling the login provider.
  await request('/secrets', 'POST', apple.functionSecrets);
  await request('/config/auth', 'PATCH', { ...identityAuthPatch(current), ...apple.authPatch });
  const verified = await (await request('/config/auth')).json();
  if (
    verified.external_apple_enabled !== true ||
    verified.external_apple_client_id !== apple.authPatch.external_apple_client_id ||
    !verified.external_apple_secret
  )
    throw new Error('Apple provider configuration was not persisted');
  const report = {
    projectRef: config.projectRef,
    appleProviderConfigured: true,
    appleDeletionSecretsConfigured: true,
    clientSecretExpiresAt: apple.expiresAt,
    realLoginVerified: false,
    cloudSyncAvailable: false,
  };
  const directory = resolve(import.meta.dirname, '../artifacts/identity');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'apple-configuration.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
}
