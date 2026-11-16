import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectIdentityConfig } from './identity-config.mjs';
import { identityAuthPatch, nativeAuthCallback } from './identity-auth-config.mjs';

if (!process.argv.includes('--apply')) {
  console.log(
    'Dry run: native callback and manual identity linking only; no provider credentials changed.',
  );
} else {
  const config = projectIdentityConfig(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../supabase/client.public.json'), 'utf8'),
    ),
  );
  const access = process.env.SUPABASE_ACCESS_TOKEN;
  if (!access) throw new Error('Configure SUPABASE_ACCESS_TOKEN in GitHub Secrets first');
  const url = `https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`;
  const headers = { authorization: `Bearer ${access}`, 'content-type': 'application/json' };
  const options = () => ({ redirect: 'error', signal: AbortSignal.timeout(15000), headers });
  const response = await fetch(url, options());
  if (!response.ok)
    throw new Error(`Cannot read Auth routing configuration (HTTP ${response.status})`);
  const current = await response.json();
  const patch = identityAuthPatch(current);
  if (Object.keys(patch).length) {
    const applied = await fetch(url, {
      ...options(),
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!applied.ok)
      throw new Error(`Cannot apply Auth routing configuration (HTTP ${applied.status})`);
  }
  const verified = await fetch(url, options());
  if (!verified.ok) throw new Error('Cannot verify Auth routing configuration');
  const auth = await verified.json();
  if (
    !auth.uri_allow_list
      ?.split(',')
      .map((v) => v.trim())
      .includes(nativeAuthCallback) ||
    auth.security_manual_linking_enabled !== true
  )
    throw new Error('Native callback or manual identity linking was not persisted');
  console.log(
    JSON.stringify({
      projectRef: config.projectRef,
      nativeCallbackAllowed: true,
      manualIdentityLinking: true,
      providerCredentialsChanged: false,
    }),
  );
}
