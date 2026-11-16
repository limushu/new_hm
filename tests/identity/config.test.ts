import { expect, test } from 'vitest';
import { identityConfig } from '../../scripts/identity-config.mjs';

test('未配置托管服务时不宣告登录可用；只接受公开客户端 key', () => {
  expect(identityConfig({})).toEqual({ configured: false });
  const origin = 'https://project.supabase.co';
  const key = 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';
  expect(identityConfig({ ANJIAN_AUTH_URL: origin, ANJIAN_AUTH_PUBLIC_KEY: key })).toEqual({
    configured: true,
    origin,
    publicKey: key,
  });
  const jwt = (role: string) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  expect(
    identityConfig({ ANJIAN_AUTH_URL: origin, ANJIAN_AUTH_PUBLIC_KEY: jwt('anon') }),
  ).toMatchObject({ configured: true });
  for (const secret of [
    'sb_secret_do-not-bundle',
    jwt('service_role'),
    jwt('authenticated'),
    'private-key',
  ]) {
    expect(() =>
      identityConfig({ ANJIAN_AUTH_URL: origin, ANJIAN_AUTH_PUBLIC_KEY: secret }),
    ).toThrow('cannot be bundled');
  }
  for (const url of [
    'http://project.supabase.co',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co/auth/v1',
    'https://project.supabase.co?key=secret',
  ]) {
    expect(() => identityConfig({ ANJIAN_AUTH_URL: url, ANJIAN_AUTH_PUBLIC_KEY: key })).toThrow(
      'HTTPS origin',
    );
  }
  expect(() => identityConfig({ ANJIAN_AUTH_URL: origin })).toThrow('needs both');
});
