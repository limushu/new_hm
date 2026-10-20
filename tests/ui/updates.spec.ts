import { expect, test, type Page } from '@playwright/test';

async function backgroundEvents(page: Page, holdManifest = false) {
  await page.addInitScript((holdManifest) => {
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let id = 0;
    let available: { version: string; notes: string } | null = null;
    let releaseManifest: () => void = () => {};
    const manifestReady = new Promise<void>((resolve) => {
      releaseManifest = resolve;
    });
    Object.assign(window, {
      isTauri: true,
      releaseTestManifest: () => releaseManifest(),
      emitTestUpdate: () => {
        available = { version: '1.2.0', notes: '隔离后台测试' };
        for (const [eventId, value] of listeners)
          if (value.event === 'update-available')
            callbacks.get(value.handler)?.({
              event: 'update-available',
              id: eventId,
              payload: available,
            });
      },
      emitTestProgress: () => {
        for (const [eventId, value] of listeners)
          if (value.event === 'update-progress')
            callbacks.get(value.handler)?.({
              event: 'update-progress',
              id: eventId,
              payload: { downloaded: 35, total: 100 },
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
          if (name === 'subsystem_manifest' && holdManifest) await manifestReady;
          if (name === 'get_update_status') return available;
          if (name === 'plugin:event|listen') {
            listeners.set(++id, args);
            return id;
          }
          if (name === 'plugin:event|unlisten') return;
          if (name === 'install_update')
            return new Promise((_, reject) => {
              Object.assign(window, {
                failTestInstall: () => reject(new Error('隔离测试：下载失败，未实际安装')),
              });
            });
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  }, holdManifest);
}

test('能力查询期间发现新版，订阅完成后从原生快照恢复提示', async ({ page }) => {
  await backgroundEvents(page, true);
  await page.goto('/?preview=1');
  await expect(page.locator('.calendar-page')).toBeVisible();
  await page.evaluate(() => {
    const runtime = window as unknown as {
      emitTestUpdate: () => void;
      releaseTestManifest: () => void;
    };
    runtime.emitTestUpdate();
    runtime.releaseTestManifest();
  });
  await expect(page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true })).toBeVisible();
});

test('设置页已打开时收到后台更新事件，侧栏和安装入口即时同步', async ({ page }) => {
  await backgroundEvents(page);
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByLabel('优先更新源')).toBeVisible();
  await page.evaluate(() => (window as unknown as { emitTestUpdate: () => void }).emitTestUpdate());
  await expect(page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '更新到 1.2.0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '安装 1.2.0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
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
  await expect(page.getByRole('dialog', { name: '安装 1.2.0', exact: true })).toContainText(
    '虚构更新测试',
  );
  await expect(page.getByLabel('优先更新源', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([]);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([]);
  await page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并安装', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不实际安装');
  expect(
    await page.evaluate(() => (window as unknown as { updateInstalls: unknown[] }).updateInstalls),
  ).toEqual([{ confirmed: true }]);
});

test('日历工作期间后台发现新版，原位查看、显示下载进度并保留失败信息', async ({ page }) => {
  await backgroundEvents(page);
  await page.goto('/?preview=1');
  await expect(page.locator('.sidebar-update')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { emitTestUpdate: () => void }).emitTestUpdate());
  await expect(page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true }).click();
  await expect(page.getByLabel('优先更新源')).toHaveCount(0);
  await page.getByRole('button', { name: '下载并安装', exact: true }).click();
  await expect(page.getByRole('button', { name: '处理中…', exact: true })).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as { emitTestProgress: () => void }).emitTestProgress(),
  );
  await expect(page.getByRole('status')).toContainText('下载进度 35%');
  await page.evaluate(() =>
    (window as unknown as { failTestInstall: () => void }).failTestInstall(),
  );
  await expect(page.getByRole('alert')).toContainText('下载失败');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.calendar-page')).toBeVisible();
});

test('窄窗口仍显示新版提示，关闭更新面板后保留正在编辑的案件', async ({ page }) => {
  await backgroundEvents(page);
  await page.setViewportSize({ width: 760, height: 600 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByLabel('案件名称', { exact: true }).fill('更新期间保留的案件编辑');
  await page.evaluate(() => (window as unknown as { emitTestUpdate: () => void }).emitTestUpdate());
  const notice = page.getByRole('button', { name: '更新案笺到 1.2.0', exact: true });
  await expect(notice).toBeVisible();
  await notice.click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('案件名称', { exact: true })).toHaveValue('更新期间保留的案件编辑');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  await page.setViewportSize({ width: 390, height: 700 });
  await notice.click();
  const box = await page.getByRole('dialog', { name: '安装 1.2.0', exact: true }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
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
