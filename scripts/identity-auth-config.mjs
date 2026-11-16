export const nativeAuthCallback = 'anjian://auth/callback';

/** Only native routing/linking settings are changed; provider credentials remain untouched. */
export function identityAuthPatch(current) {
  const patch = {};
  const redirects = [
    ...new Set(
      (current.uri_allow_list ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  if (!redirects.includes(nativeAuthCallback)) {
    redirects.push(nativeAuthCallback);
    patch.uri_allow_list = redirects.join(',');
  }
  if (current.security_manual_linking_enabled !== true)
    patch.security_manual_linking_enabled = true;
  if (!current.site_url || /^https?:\/\/localhost(?::\d+)?\/?$/.test(current.site_url))
    patch.site_url = nativeAuthCallback;
  return patch;
}
