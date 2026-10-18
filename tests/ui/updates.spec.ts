import { expect, test } from '@playwright/test';

test('设置页已打开时收到后台更新事件，侧栏和安装入口即时同步', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let id = 0;
    Object.assign(window, {
      isTauri: true,
      emitTestUpdate: () => {
        for (const [eventId, value] of listeners)
          if (value.event === 'update-available')
            callbacks.get(value.handler)?.({
              event: 'update-available',
              id: eventId,
              payload: { version: '1.2.0', notes: '隔离后台测试' },
            });
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_: string, eventId: number) => listeners.delete(eventId),
      },
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (event: unknown) => void) => {
          callbacks.set(++id, callback);
          return id;
        },
        invoke: async (name: string, args: { event: string; handler: number }) => {
          if (name === 'plugin:event|listen') {
            listeners.set(++id, args);
            return id;
          }
          if (name === 'plugin:event|unlisten') return;
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByLabel('优先更新源')).toBeVisible();
  await page.evaluate(() => (window as unknown as { emitTestUpdate: () => void }).emitTestUpdate());
  await expect(page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '更新到 1.2.0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true }).click();
  await expect(page.getByRole('button', { name: '更新到 1.2.0', exact: true })).toBeVisible();
});

test('发现新版后侧栏提示，点击只查看更新，确认后才调用安装', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      isTauri: true,
      updateInstalls: [],
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'get_update_status') return { version: '1.2.0', notes: '虚构更新测试' };
          if (name === 'install_update') {
            (window as unknown as { updateInstalls: unknown[] }).updateInstalls.push(args);
            throw new Error('隔离测试：不实际安装');
          }
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true }).click();
  await expect(page.getByRole('button', { name: '更新到 1.2.0', exact: true })).toBeVisible();
  await expect(page.getByLabel('优先更新源', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([]);
  await page.getByRole('button', { name: '更新到 1.2.0', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([]);
  await page.getByRole('button', { name: '更新到 1.2.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并安装', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不实际安装');
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([{ confirmed: true }]);
});

test('没有新版时不占据侧栏，不把检查失败描述为最新', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'check_update') throw new Error('暂时无法连接更新服务');
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await expect(page.locator('.sidebar-update')).toHaveCount(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法连接更新服务');
  await expect(page.getByText('当前已是最新版本。', { exact: true })).toHaveCount(0);
});
