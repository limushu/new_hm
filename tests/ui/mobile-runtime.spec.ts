import { expect, test, type Page } from '@playwright/test';

async function mobileRuntime(page: Page) {
  await page.addInitScript(() => {
    const forbidden = new Set([
      'autostart_status',
      'set_autostart',
      'get_update_status',
      'check_update',
      'install_update',
      'pick_materials',
      'pick_receipt_file',
      'save_ledger_with_receipt',
      'import_material_paths',
      'save_recording',
      'open_material',
      'export_material',
      'choose_backup_directory',
      'pick_restore_backup',
      'apply_restore_backup',
      'plugin:window|set_theme',
    ]);
    const callbacks = new Map<number, (event: unknown) => void>();
    let nextId = 0;
    Object.assign(window, {
      isTauri: true,
      mobileResumes: 0,
      forbiddenMobileCalls: [] as string[],
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (event: unknown) => void) => {
          callbacks.set(++nextId, callback);
          return nextId;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        invoke: async (name: string, args: unknown) => {
          if (forbidden.has(name)) {
            (window as unknown as { forbiddenMobileCalls: string[] }).forbiddenMobileCalls.push(
              name,
            );
            throw new Error(`Unsupported mobile command: ${name}`);
          }
          if (name === 'subsystem_manifest')
            return {
              version: 1,
              subsystems: [
                { id: 'host', state: 'ready', capabilities: [] },
                { id: 'updates', state: 'unsupported', capabilities: [] },
                { id: 'maintenance', state: 'ready', capabilities: ['foreground-maintenance'] },
                { id: 'documents', state: 'unsupported', capabilities: [] },
                { id: 'recording', state: 'unsupported', capabilities: [] },
                { id: 'backup', state: 'ready', capabilities: ['local-backup'] },
              ],
            };
          if (name === 'resume_runtime') {
            (window as unknown as { mobileResumes: number }).mobileResumes++;
            return;
          }
          if (name === 'plugin:event|listen') return ++nextId;
          if (name === 'plugin:event|unlisten') return;
          if (name === 'run_backup')
            return {
              directory: '/isolated-mobile/backups/sample',
              createdAt: new Date().toISOString(),
              caseCount: 2,
              fileCount: 0,
            };
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
}

test('移动宿主保留本地备份和主题，隐藏桌面/尚未接入的系统入口', async ({ page }) => {
  await mobileRuntime(page);
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByLabel('开机启动')).toHaveCount(0);
  await expect(page.getByLabel('关闭窗口后留在托盘')).toHaveCount(0);
  await expect(page.getByLabel('日程系统通知')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '恢复备份', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择位置', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '版本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '立即备份', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已备份 2 个案件');
  expect(
    await page.evaluate(
      () => (window as unknown as { forbiddenMobileCalls: string[] }).forbiddenMobileCalls,
    ),
  ).toEqual([]);
});

test('恢复前台触发维护，手机材料页保留业务操作但禁用上传和录音', async ({ page }) => {
  await mobileRuntime(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?preview=1');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { mobileResumes: number }).mobileResumes))
    .toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    return (window as unknown as { mobileResumes: number }).mobileResumes;
  });
  expect(
    await page.evaluate(() => (window as unknown as { mobileResumes: number }).mobileResumes),
  ).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { mobileResumes: number }).mobileResumes))
    .toBeGreaterThan(before);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await expect(page.getByRole('button', { name: '录音', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '添加材料', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '文件夹', exact: true }).click();
  await page.getByLabel('文件夹名称').fill('手机新建文件夹');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.material-list')).toContainText('手机新建文件夹');
  expect(
    await page.evaluate(
      () => (window as unknown as { forbiddenMobileCalls: string[] }).forbiddenMobileCalls,
    ),
  ).toEqual([]);
});
