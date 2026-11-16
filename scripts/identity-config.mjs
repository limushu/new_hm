/** Public configuration only. Provider secrets and service_role must remain on the hosted service. */
export function identityConfig(env) {
  const origin = env.ANJIAN_AUTH_URL?.trim();
  const key = env.ANJIAN_AUTH_PUBLIC_KEY?.trim();
  if (!origin && !key) return { configured: false };
  if (!origin || !key)
    throw new Error('Identity configuration needs both ANJIAN_AUTH_URL and ANJIAN_AUTH_PUBLIC_KEY');
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('Identity URL must be an HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Identity URL must be an HTTPS origin');
  if (
    key.startsWith('sb_publishable_') &&
    /^[A-Za-z0-9_-]{20,}$/.test(key.slice('sb_publishable_'.length))
  )
    return { configured: true, origin: url.origin, publicKey: key };
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.role === 'anon') return { configured: true, origin: url.origin, publicKey: key };
    } catch {
      /* Configuration is rejected below; never include the supplied key in errors. */
    }
  }
  throw new Error(
    'Use a publishable/anon key. Secret keys, service_role and user access tokens cannot be bundled',
  );
}

export function projectIdentityConfig(value) {
  const config = identityConfig({
    ANJIAN_AUTH_URL: value?.url,
    ANJIAN_AUTH_PUBLIC_KEY: value?.publicKey,
  });
  if (!config.configured || !/^[a-z0-9]{20}$/.test(value?.projectRef ?? ''))
    throw new Error(
      'Identity project needs an explicit project reference and public configuration',
    );
  if (
    new URL(config.origin).hostname.endsWith('.supabase.co') &&
    new URL(config.origin).hostname !== `${value.projectRef}.supabase.co`
  )
    throw new Error('Identity project reference and service URL do not match');
  return { ...config, projectRef: value.projectRef };
}
