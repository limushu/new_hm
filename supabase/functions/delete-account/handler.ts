/** Hosted account deletion. Only the authenticated user ID is accepted, never a body-supplied ID. */
export interface Dependencies {
  env(name: string): string | undefined;
  fetch: typeof fetch;
  now?: () => number;
}
const json = (status: number, code: string) =>
  new Response(JSON.stringify({ code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

async function appleSecret(deps: Dependencies): Promise<string> {
  const keyId = deps.env('APPLE_KEY_ID');
  const team = deps.env('APPLE_TEAM_ID');
  const client = deps.env('APPLE_OAUTH_CLIENT_ID');
  const pem = deps.env('APPLE_PRIVATE_KEY');
  if (!keyId || !team || !client || !pem) throw new Error('apple_not_configured');
  const bytes = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const encode = (object: unknown) => b64url(new TextEncoder().encode(JSON.stringify(object)));
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: team, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: client })}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64url(new Uint8Array(signature))}`;
}

export async function handleDelete(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return json(405, 'method_not_allowed');
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))
    return json(401, 'authentication_required');
  if (Number(request.headers.get('content-length') ?? 0) > 16384)
    return json(413, 'request_too_large');
  let body: { confirmation?: unknown; appleRefreshToken?: unknown };
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 16384) {
            await reader.cancel();
            return json(413, 'request_too_large');
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(bytes);
    body = JSON.parse(text);
    if (!body || typeof body !== 'object') return json(400, 'confirmation_required');
  } catch {
    return json(400, 'confirmation_required');
  }
  if (body.confirmation !== 'DELETE_MY_ACCOUNT') return json(400, 'confirmation_required');
  const origin = deps.env('SUPABASE_URL');
  const publicKey = deps.env('SUPABASE_ANON_KEY');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!origin || !publicKey || !serviceKey) return json(503, 'account_service_unavailable');
  let url: URL;
  try {
    url = new URL(origin);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return json(503, 'account_service_unavailable');
  } catch {
    return json(503, 'account_service_unavailable');
  }
  try {
    const who = await deps.fetch(new URL('/auth/v1/user', url), {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { apikey: publicKey, authorization },
    });
    if (!who.ok)
      return json(
        who.status >= 500 ? 503 : 401,
        who.status >= 500 ? 'account_service_unavailable' : 'authentication_required',
      );
    const user = (await who.json()) as { id?: string; identities?: Array<{ provider?: string }> };
    if (
      !user.id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
    )
      return json(401, 'authentication_required');
    if (user.identities?.some((identity) => identity.provider === 'apple')) {
      const token = body.appleRefreshToken;
      if (typeof token !== 'string' || !token || token.length > 8192)
        return json(409, 'apple_reauthorization_required');
      let secret: string;
      try {
        secret = await appleSecret(deps);
      } catch {
        return json(503, 'apple_revocation_unavailable');
      }
      const revoked = await deps.fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: deps.env('APPLE_OAUTH_CLIENT_ID')!,
          client_secret: secret,
          token,
          token_type_hint: 'refresh_token',
        }),
      });
      if (!revoked.ok) return json(503, 'apple_revocation_failed');
    }
    const deleted = await deps.fetch(new URL(`/auth/v1/admin/users/${user.id}`, url), {
      method: 'DELETE',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ should_soft_delete: false }),
    });
    if (!deleted.ok) return json(503, 'account_deletion_failed');
    return json(200, 'account_deleted');
  } catch {
    return json(503, 'account_service_unavailable');
  }
}
