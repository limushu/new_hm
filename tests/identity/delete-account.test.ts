import { expect, test } from 'vitest';
import { handleDelete, type Dependencies } from '../../supabase/functions/delete-account/handler';

const user = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
function request(
  body: unknown = { confirmation: 'DELETE_MY_ACCOUNT' },
  authorization = 'Bearer session-token',
) {
  return new Request('https://project.supabase.co/functions/v1/delete-account', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function setup(apple = false) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
  };
  const deps: Dependencies = {
    env: (name) => env[name],
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/auth/v1/user'))
        return Response.json({ id: user, identities: [{ provider: apple ? 'apple' : 'azure' }] });
      return Response.json({});
    },
  };
  return { deps, calls, env };
}
test('删除只使用服务端验证的用户ID，忽略客户端伪造的用户ID', async () => {
  const { deps, calls } = setup();
  const response = await handleDelete(
    request({ confirmation: 'DELETE_MY_ACCOUNT', userId: other }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(calls.map((c) => c.url)).toEqual([
    'https://project.supabase.co/auth/v1/user',
    `https://project.supabase.co/auth/v1/admin/users/${user}`,
  ]);
  expect(calls[1].init?.headers).toMatchObject({ authorization: 'Bearer server-only-key' });
  expect(JSON.stringify(await response.json())).not.toContain('server-only-key');
});
test('未登录、确认缺失和无效会话均不会调用管理删除接口', async () => {
  const { deps, calls } = setup();
  expect((await handleDelete(request({}, ''), deps)).status).toBe(401);
  expect((await handleDelete(request({}), deps)).status).toBe(400);
  expect(calls).toHaveLength(0);
  deps.fetch = async () => new Response('', { status: 401 });
  expect((await handleDelete(request(), deps)).status).toBe(401);
});
test('无 content-length 的过大请求也受限制，服务故障不能误判为已注销', async () => {
  const { deps, calls } = setup();
  expect(
    (
      await handleDelete(
        request({ confirmation: 'DELETE_MY_ACCOUNT', padding: 'a'.repeat(20000) }),
        deps,
      )
    ).status,
  ).toBe(413);
  expect(calls).toHaveLength(0);
  deps.fetch = async () => {
    throw new Error('server-only-key must not appear in response');
  };
  const response = await handleDelete(request(), deps);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('server-only-key');
});
test('Apple 绑定账号须先重验证并撤销授权，缺配置时不提前删掉账号', async () => {
  const { deps, calls } = setup(true);
  const response = await handleDelete(request(), deps);
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe('apple_reauthorization_required');
  const missing = await handleDelete(
    request({ confirmation: 'DELETE_MY_ACCOUNT', appleRefreshToken: 'private-token' }),
    deps,
  );
  expect(missing.status).toBe(503);
  expect(calls.every((c) => c.url.endsWith('/auth/v1/user'))).toBe(true);
});
test('Apple 密钥仅在服务端签名，先撤销再删除，响应不包含令牌', async () => {
  const { deps, calls, env } = setup(true);
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  env.APPLE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
  env.APPLE_KEY_ID = 'TEST_KEY';
  env.APPLE_TEAM_ID = 'TEST_TEAM';
  env.APPLE_OAUTH_CLIENT_ID = 'test.service';
  deps.now = () => 2000000000000;
  const response = await handleDelete(
    request({ confirmation: 'DELETE_MY_ACCOUNT', appleRefreshToken: 'private-revocation-token' }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(calls[1].url).toBe('https://appleid.apple.com/auth/revoke');
  expect(calls[2].url).toBe(`https://project.supabase.co/auth/v1/admin/users/${user}`);
  const params = calls[1].init?.body as URLSearchParams;
  const jwt = params.get('client_secret')!;
  const [header, payload, signature] = jwt.split('.');
  const decode = (s: string) =>
    Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
  expect(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.publicKey,
      decode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true);
  expect(JSON.parse(new TextDecoder().decode(decode(payload)))).toEqual({
    iss: 'TEST_TEAM',
    iat: 2000000000,
    exp: 2000000300,
    aud: 'https://appleid.apple.com',
    sub: 'test.service',
  });
  expect(await response.text()).not.toContain('private-revocation-token');
});
test('认证服务的5xx不能触发账号删除', async () => {
  const { deps, calls } = setup();
  deps.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response('', { status: 503 });
  };
  expect((await handleDelete(request(), deps)).status).toBe(503);
  expect(calls).toHaveLength(1);
});
