import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityMigrationSql } from '../../scripts/identity-migration.mjs';

const db = new PGlite();
const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
const bindingA = '00000000-0000-0000-0000-000000000011';
const bindingB = '00000000-0000-0000-0000-000000000012';
const workspaceA = '00000000-0000-0000-0000-000000000021';
async function asUser<T>(id: string, action: () => Promise<T>) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    return await action();
  } finally {
    await db.exec('reset role');
  }
}
beforeAll(async () => {
  // Minimal Auth environment; the migration and real PostgreSQL RLS/constraints run unchanged.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  const migration = identityMigrationSql(
    readFileSync(
      new URL('../../supabase/migrations/202611160001_account_catalog.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(migration);
  await db.exec(migration); // Real hosted-deploy wrapper is repeatable without resetting records.
  await db.query('insert into auth.users(id) values ($1),($2)', [userA, userB]);
  await asUser(userA, () =>
    db.query(
      "insert into public.cloud_bindings(id,provider,provider_subject,label) values ($1,'onedrive','cloud-a','我的云')",
      [bindingA],
    ),
  );
  await asUser(userB, () =>
    db.query(
      "insert into public.cloud_bindings(id,provider,provider_subject) values ($1,'onedrive','cloud-b')",
      [bindingB],
    ),
  );
  await asUser(userA, () =>
    db.query(
      'insert into public.workspaces(id,label,provider,cloud_binding_id,remote_locator) values ($1,\'案件工作区\',\'onedrive\',$2,\'{"driveId":"drive-a","folderId":"folder-a"}\')',
      [workspaceA, bindingA],
    ),
  );
}, 60000);
afterAll(() => db.close());

test('用户只能读取和修改自己的账号目录，不能冒认 owner 或修改身份主键', async () => {
  await asUser(userA, async () => {
    expect((await db.query('select id from public.account_profiles')).rows).toEqual([
      { id: userA },
    ]);
    expect((await db.query('select id from public.cloud_bindings')).rows).toEqual([
      { id: bindingA },
    ]);
    expect((await db.query('select id from public.workspaces')).rows).toEqual([{ id: workspaceA }]);
    await db.query("update public.account_profiles set display_name='律师甲' where id=$1", [userA]);
    await expect(
      db.query('update public.account_profiles set id=$1 where id=$2', [userB, userA]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.cloud_bindings(owner_id,provider,provider_subject) values ($1,'onedrive','spoof')",
        [userB],
      ),
    ).rejects.toThrow();
    await db.query("update public.cloud_bindings set label='不该修改' where id=$1", [bindingB]);
  });
  await asUser(userB, async () => {
    expect((await db.query('select id from public.workspaces')).rows).toEqual([]);
    expect((await db.query('select label from public.cloud_bindings')).rows).toEqual([
      { label: '' },
    ]);
    await expect(
      db.query(
        'insert into public.workspaces(provider,cloud_binding_id,remote_locator) values (\'onedrive\',$1,\'{"folderId":"stolen"}\')',
        [bindingA],
      ),
    ).rejects.toThrow();
  });
});

test('匿名调用不可访问目录，工作区不能混用其他云的绑定或存入令牌字段', async () => {
  await db.exec('set role anon');
  try {
    await expect(db.query('select * from public.workspaces')).rejects.toThrow();
  } finally {
    await db.exec('reset role');
  }
  await asUser(userA, async () => {
    await expect(
      db.query(
        "insert into public.workspaces(provider,cloud_binding_id,remote_locator) values ('google-drive',$1,'{}')",
        [bindingA],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        'update public.workspaces set remote_locator=\'{"access_token":"must-not-store"}\' where id=$1',
        [workspaceA],
      ),
    ).rejects.toThrow();
    await expect(
      db.query('update public.workspaces set owner_id=$1 where id=$2', [userB, workspaceA]),
    ).rejects.toThrow();
  });
});

test('账号删除级联清理自己的目录，其他账号保留；云绑定不可绕过工作区引用直接删除', async () => {
  await asUser(userA, () =>
    expect(db.query('delete from public.cloud_bindings where id=$1', [bindingA])).rejects.toThrow(),
  );
  await db.query('delete from auth.users where id=$1', [userA]);
  expect((await db.query('select id from public.workspaces')).rows).toEqual([]);
  expect((await db.query('select id from public.cloud_bindings')).rows).toEqual([{ id: bindingB }]);
  expect((await db.query('select id from public.account_profiles')).rows).toEqual([{ id: userB }]);
});
