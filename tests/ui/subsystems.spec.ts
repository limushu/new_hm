import { expect, test } from '@playwright/test';

test('不支持桌面子系统时仍可读取设置且不调用桌面命令', async ({ page }) => {
  await page.addInitScript(() => {
    const forbidden = [
      'autostart_status',
      'get_update_status',
      'background_status',
      'plugin:window|set_theme',
      'plugin:event|listen',
    ];
    Object.assign(window, {
      isTauri: true,
      subsystemCalls: [] as string[],
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'subsystem_manifest')
            return {
              version: 1,
              subsystems: [
                // A capability listed on an unsupported adapter must remain disabled.
                { id: 'host', state: 'unsupported', capabilities: ['tray', 'autostart'] },
                { id: 'updates', state: 'unsupported', capabilities: ['signed-updates'] },
                { id: 'maintenance', state: 'unsupported', capabilities: [] },
              ],
            };
          if (name === 'get_settings')
            return { notifications: 'true', backup_directory: '/isolated-backups' };
          if (forbidden.includes(name)) {
            (window as unknown as { subsystemCalls: string[] }).subsystemCalls.push(name);
            throw new Error('Unsupported platform command');
          }
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '备份与恢复', exact: true })).toBeVisible();
  await expect(page.getByLabel('关闭窗口后留在托盘')).toHaveCount(0);
  await expect(page.getByLabel('开机启动')).toHaveCount(0);
  await expect(page.getByLabel('优先更新源')).toHaveCount(0);
  await expect(page.locator('.settings-path code')).toHaveText('/isolated-backups');
  expect(
    await page.evaluate(() => (window as unknown as { subsystemCalls: string[] }).subsystemCalls),
  ).toEqual([]);
});

test('能力查询失败时禁用平台入口并显示错误，业务设置仍然可用', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'subsystem_manifest') throw new Error('隔离测试：能力查询失败');
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('能力查询失败');
  await expect(page.getByLabel('开机启动')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
