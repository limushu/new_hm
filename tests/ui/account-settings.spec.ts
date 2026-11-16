import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
async function runtime(page: Page, mode: 'ready' | 'unconfigured' | 'offline' = 'ready') {
  await page.addInitScript(
    ({ mode }) => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      let account: { id: string; name: string; email: string; providers: string[] } | null = null;
      let deleteAttempts = 0;
      const snapshot = () => ({
        installed: true,
        account,
        cloudSyncAvailable: false,
        providers: ['apple', 'google', 'azure'].map((provider) => ({
          provider,
          enabled: mode !== 'unconfigured',
        })),
      });
      Object.assign(window, {
        isTauri: true,
        accountCalls: calls,
        __TAURI_INTERNALS__: {
          invoke: async (name: string, args: Record<string, unknown>) => {
            if (name.startsWith('identity_')) {
              calls.push({ name, args });
              if (name === 'identity_status') {
                if (mode === 'offline') throw { kind: 'io', code: 'identity_service_unavailable' };
                return snapshot();
              }
              if (name === 'identity_sign_in') {
                account = {
                  id: '00000000-0000-0000-0000-000000000001',
                  name: '虚构律师',
                  email: 'test@example.invalid',
                  providers: [String(args.provider)],
                };
                return snapshot();
              }
              if (name === 'identity_link') {
                account?.providers.push(String(args.provider));
                return snapshot();
              }
              if (name === 'identity_unlink') {
                if (account)
                  account.providers = account.providers.filter((p) => p !== args.provider);
                return snapshot();
              }
              if (name === 'identity_delete_account') {
                if (++deleteAttempts === 1)
                  throw { kind: 'invalid-state', code: 'identity_delete_failed' };
                account = null;
                return null;
              }
              if (name === 'identity_sign_out') {
                account = null;
                return null;
              }
            }
            const { previewCommand } = await import(
              new URL('/src/services/preview.ts', location.origin).href
            );
            return previewCommand(name, args);
          },
        },
      });
    },
    { mode },
  );
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).tap();
  return page.getByRole('region', { name: '案笺账号', exact: true });
}
test('未配置的提供器不可登录，不把账号与同步混为一谈', async ({ page }) => {
  const section = await runtime(page, 'unconfigured');
  await expect(section).toContainText('登录方式正在配置中');
  await expect(
    section.getByRole('button', { name: '使用 Apple 登录', exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByRole('button', { name: '使用 Google 登录', exact: true }),
  ).toBeDisabled();
  await expect(section).toContainText('自动跨设备同步尚未开放');
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as unknown as { accountCalls: unknown[] }).accountCalls),
    ),
  ).not.toContain('identity_sign_in');
});
test('绑定先确认，最后一种登录方式不能解绑，退出后本机案件仍存在', async ({ page }) => {
  const section = await runtime(page);
  await section.getByRole('button', { name: '使用 Google 登录', exact: true }).tap();
  await expect(section).toContainText('虚构律师');
  const google = section
    .locator('.account-provider')
    .filter({ has: page.locator('span').filter({ hasText: /^Google/ }) });
  await expect(google.getByRole('button', { name: '解绑', exact: true })).toBeDisabled();
  const apple = section
    .locator('.account-provider')
    .filter({ has: page.locator('span').filter({ hasText: /^Apple/ }) });
  await apple.getByRole('button', { name: '绑定', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '绑定 Apple', exact: true });
  await expect(dialog).toContainText('当前案笺账号');
  await dialog.getByRole('button', { name: '继续绑定', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(google.getByRole('button', { name: '解绑', exact: true })).toBeEnabled();
  await section.getByRole('button', { name: '退出登录', exact: true }).tap();
  await expect(section).toContainText('本地案件保留');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: '张某与李某借款纠纷（示例）', exact: true }),
  ).toBeVisible();
});
test('删除必须显式确认，服务端失败不关闭确认页或清除账号，可重试', async ({ page }) => {
  const section = await runtime(page);
  await section.getByRole('button', { name: '使用 Google 登录', exact: true }).tap();
  await section.getByRole('button', { name: '删除账号', exact: true }).tap();
  let dialog = page.getByRole('dialog', { name: '删除案笺账号', exact: true });
  await expect(dialog).toContainText('外部云文件不会删除');
  await dialog.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(section).toContainText('虚构律师');
  await section.getByRole('button', { name: '删除账号', exact: true }).tap();
  dialog = page.getByRole('dialog', { name: '删除案笺账号', exact: true });
  await dialog.getByRole('button', { name: '确认删除账号', exact: true }).tap();
  await expect(dialog.getByRole('alert')).toContainText('账号删除未完成');
  await expect(section).toContainText('虚构律师');
  await dialog.getByRole('button', { name: '确认删除账号', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(section).toContainText('服务端目录已删除');
  await expect(
    section.getByRole('button', { name: '使用 Google 登录', exact: true }),
  ).toBeEnabled();
});
test('账号服务离线时可以清除本机登录，业务页面继续使用', async ({ page }) => {
  const section = await runtime(page, 'offline');
  await expect(section.getByRole('alert')).toContainText('本机案件仍可使用');
  await section.getByRole('button', { name: '清除本机登录', exact: true }).tap();
  await expect(section).toContainText('本地案件保留');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: '张某与李某借款纠纷（示例）', exact: true }),
  ).toBeVisible();
});
