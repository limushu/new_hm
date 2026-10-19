import { expect, test, type Page } from '@playwright/test';

// Model 1.4.1's real upgrade state: existing case + auto-written legacy flag.
// The mock persists settings across reloads; production uses the native SQLite command.
async function legacyDesktop(page: Page, failFirstSave = false) {
  await page.addInitScript((failFirstSave) => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        invoke: async (name: string, args: { key?: string; value?: string }) => {
          if (name === 'plugin:event|listen') return 1;
          if (name === 'plugin:event|unlisten') return;
          if (name === 'get_settings')
            return { onboarding_done: localStorage.getItem('test-welcome-seen') ?? 'true' };
          if (name === 'set_setting' && args.key === 'onboarding_done') {
            if (failFirstSave && !localStorage.getItem('test-failure-retried')) {
              localStorage.setItem('test-failure-retried', 'true');
              throw new Error('隔离测试：保存失败');
            }
            localStorage.setItem('test-welcome-seen', args.value!);
            return;
          }
          const path = '/src/services/preview.ts';
          return (await import(path)).previewCommand(name, args);
        },
      },
    });
  }, failFirstSave);
}

test('已有案件和旧版 true 标记仍展示欢迎，完成后重启不再显示，可从设置重播', async ({ page }) => {
  await legacyDesktop(page);
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: '欢迎使用案笺', exact: true });
  await expect(welcome).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('test-welcome-seen'))).toBeNull();
  await welcome.getByRole('button', { name: '跳过', exact: true }).click();
  await expect(welcome).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('test-welcome-seen'))).toBe('hm-welcome-1');
  await page.reload();
  await expect(page.locator('.calendar-page')).toBeVisible();
  await expect(welcome).toHaveCount(0);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(1);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '重播欢迎动画', exact: true }).click();
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重播欢迎动画', exact: true }).click();
  await welcome.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(welcome).toHaveCount(0);
});

test('保存失败不误记已完成，保留重试入口，成功后重启不再打断', async ({ page }) => {
  await legacyDesktop(page, true);
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: '欢迎使用案笺', exact: true });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: '开始使用', exact: true }).click();
  await expect(welcome.getByRole('alert')).toContainText('请重试');
  expect(await page.evaluate(() => localStorage.getItem('test-welcome-seen'))).toBeNull();
  await welcome.getByRole('button', { name: '跳过', exact: true }).click();
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.calendar-page')).toBeVisible();
  await expect(welcome).toHaveCount(0);
});
