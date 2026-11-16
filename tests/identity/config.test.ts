import { expect, test } from 'vitest';
import { identityConfig, projectIdentityConfig } from '../../scripts/identity-config.mjs';
import { identityAuthPatch, nativeAuthCallback } from '../../scripts/identity-auth-config.mjs';

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

test('部署目标与公开客户端配置必须指向同一项目', () => {
  const key = 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';
  const ref = 'abcdefghijklmnopqrst';
  expect(
    projectIdentityConfig({ projectRef: ref, url: `https://${ref}.supabase.co`, publicKey: key }),
  ).toMatchObject({ projectRef: ref, configured: true });
  expect(() =>
    projectIdentityConfig({ projectRef: ref, url: 'https://other.supabase.co', publicKey: key }),
  ).toThrow('do not match');
  expect(() =>
    projectIdentityConfig({ projectRef: '', url: `https://${ref}.supabase.co`, publicKey: key }),
  ).toThrow('explicit project reference');
});

test('原生回调配置保留现有应用网址和提供器密钥，重复应用不产生更改', () => {
  const current = {
    site_url: 'https://existing.example',
    uri_allow_list: 'https://existing.example/callback',
    security_manual_linking_enabled: false,
    external_google_enabled: true,
    external_google_secret: 'must-not-copy',
  };
  const patch = identityAuthPatch(current);
  expect(patch).toEqual({
    uri_allow_list: `https://existing.example/callback,${nativeAuthCallback}`,
    security_manual_linking_enabled: true,
  });
  expect(identityAuthPatch({ ...current, ...patch })).toEqual({});
  expect(
    identityAuthPatch({
      site_url: 'http://localhost:3000',
      uri_allow_list: '',
      security_manual_linking_enabled: false,
    }),
  ).toEqual({
    site_url: nativeAuthCallback,
    uri_allow_list: nativeAuthCallback,
    security_manual_linking_enabled: true,
  });
});
