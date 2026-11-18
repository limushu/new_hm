import { expect, test } from '@playwright/test';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

for (const commitError of [false, true]) {
  test(`incoming updates wait for editors and refresh after native commit${commitError ? ' with an error' : ''}`, async ({
    page,
  }) => {
    await page.addInitScript((commitError) => {
      const calls: string[] = [];
      let applied = false;
      // Exercise a stale hidden WebView with a native foreground window too.
      if (commitError) Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
      Object.assign(window, {
        isTauri: true,
        syncCalls: calls,
        __TAURI_INTERNALS__: {
          invoke: async (name: string, args: Record<string, unknown>) => {
            if (name.startsWith('sync_')) {
              calls.push(name);
              if (name === 'sync_presence') return true;
              if (name === 'sync_apply_pending') {
                if (args.token !== 'incoming-test') throw new Error('Wrong token');
                applied = true;
                if (commitError) throw { code: 'io_failed', kind: 'io' };
              }
              return {
                installed: true,
                configured: true,
                enabled: true,
                phase: applied ? 'synced' : 'incoming',
                errorCode: null,
                lastSuccessAt: null,
                workspaceLabel: '我的案件',
                conflict: null,
                incoming: applied
                  ? null
                  : {
                      token: 'incoming-test',
                      summary: { createdAt: '2026-11-17T00:00:00Z', caseCount: 1, fileCount: 0 },
                    },
              };
            }
            const { previewCommand } = await import(
              new URL('/src/services/preview.ts', location.origin).href
            );
            const result = await previewCommand(name, args);
            if (name === 'load_workspace' && applied && result.cases.length)
              result.cases[0].title = '云端更新后的虚构案件';
            return result;
          },
        },
      });
      document.addEventListener('DOMContentLoaded', () => {
        const editor = document.createElement('textarea');
        editor.id = 'unsaved-sync-test';
        editor.value = '尚未保存的草稿';
        document.body.appendChild(editor);
      });
    }, commitError);
    await page.goto('/?preview=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#unsaved-sync-test')).toHaveValue('尚未保存的草稿');
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { syncCalls: string[] }).syncCalls.includes('sync_status'),
        ),
      )
      .toBeTruthy();
    await page.waitForTimeout(2500);
    expect(
      await page.evaluate(() =>
        (window as unknown as { syncCalls: string[] }).syncCalls.includes('sync_apply_pending'),
      ),
    ).toBe(false);
    await page.locator('#unsaved-sync-test').evaluate((element) => element.remove());
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { syncCalls: string[] }).syncCalls.includes('sync_apply_pending'),
        ),
      )
      .toBeTruthy();
    await page.getByRole('button', { name: '案件', exact: true }).tap();
    await expect(
      page.getByText('云端更新后的虚构案件', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  });
}

test('the editor gate ignores hidden retained views and searches but blocks dialogs and real editors', async ({
  page,
}) => {
  await page.goto('/?preview=1', { waitUntil: 'domcontentloaded' });
  const results = await page.evaluate(async () => {
    const { canApplyIncoming, freezeWorkspace } = await import('/src/platform/syncActivity.ts');
    const host = document.createElement('section');
    document.body.appendChild(host);
    host.innerHTML =
      '<input type="search" placeholder="搜索案件"><div style="display:none"><textarea>hidden</textarea></div>';
    const idle = canApplyIncoming(document);
    host.innerHTML += '<input aria-label="案件标题" value="未保存">';
    const editing = canApplyIncoming(document);
    host.innerHTML = '<dialog open><p>正在编辑</p></dialog>';
    const dialog = canApplyIncoming(document);
    host.remove();
    const thaw = freezeWorkspace(document);
    const frozen = document.getElementById('root')!.hasAttribute('inert');
    thaw();
    return {
      idle,
      editing,
      dialog,
      frozen,
      thawed: !document.getElementById('root')!.hasAttribute('inert'),
    };
  });
  expect(results).toEqual({
    idle: true,
    editing: false,
    dialog: false,
    frozen: true,
    thawed: true,
  });
});

test('enable can recover from interruption and stale WebView visibility without resetting data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let enabled = false;
    let confirmedForeground = false;
    let synced = false;
    const calls: string[] = [];
    const native = { foreground: false };
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
    const status = () => ({
      installed: true,
      configured: true,
      enabled,
      phase: enabled ? (synced ? 'synced' : 'pending') : 'disabled',
      errorCode: null,
      lastSuccessAt: null,
      workspaceLabel: '我的案件',
      conflict: null,
      incoming: null,
    });
    Object.assign(window, {
      isTauri: true,
      syncCalls: calls,
      nativeSyncHost: native,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name.startsWith('sync_')) {
            calls.push(name);
            if (name === 'sync_presence') {
              confirmedForeground = native.foreground;
              return confirmedForeground;
            }
            if (name === 'sync_status') return status();
            if (name === 'sync_disable') {
              enabled = false;
              return status();
            }
            if (!confirmedForeground) throw { code: 'sync_interrupted', kind: 'invalid-state' };
            if (name === 'sync_workspaces') return [{ id: 'test-workspace', label: '我的案件' }];
            if (name === 'sync_enable') enabled = true;
            if (name === 'sync_tick') synced = true;
            return status();
          }
          const { previewCommand } = await import(
            new URL('/src/services/preview.ts', location.origin).href
          );
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '设置', exact: true }).tap();
  const settings = page.getByRole('region', { name: 'iCloud 同步', exact: true });
  await settings.getByRole('button', { name: '开启 iCloud 同步', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '开启 iCloud 同步', exact: true });
  await dialog.getByRole('button', { name: '继续', exact: true }).tap();
  await expect(dialog.getByRole('alert')).toContainText('同步操作已中断');
  await page.evaluate(() => {
    (window as unknown as { nativeSyncHost: { foreground: boolean } }).nativeSyncHost.foreground =
      true;
    window.dispatchEvent(new Event('pageshow'));
  });
  await dialog.getByRole('button', { name: '继续', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(settings.getByRole('status')).toContainText('已同步');
  // Another missing visibility event cannot stall the next foreground retry.
  await page.evaluate(() => {
    (window as unknown as { nativeSyncHost: { foreground: boolean } }).nativeSyncHost.foreground =
      false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  const beforeResume = await page.evaluate(
    () =>
      (window as unknown as { syncCalls: string[] }).syncCalls.filter(
        (name) => name === 'sync_tick',
      ).length,
  );
  await page.evaluate(() => {
    (window as unknown as { nativeSyncHost: { foreground: boolean } }).nativeSyncHost.foreground =
      true;
    window.dispatchEvent(new Event('focus'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { syncCalls: string[] }).syncCalls.filter(
            (name) => name === 'sync_tick',
          ).length,
      ),
    )
    .toBeGreaterThan(beforeResume);
  await settings.getByRole('button', { name: '暂停同步', exact: true }).tap();
  await expect(settings.getByRole('status')).toContainText('尚未开启');
  const stopped = await page.evaluate(
    () =>
      (window as unknown as { syncCalls: string[] }).syncCalls.filter(
        (name) => name === 'sync_tick',
      ).length,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(1800);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { syncCalls: string[] }).syncCalls.filter(
          (name) => name === 'sync_tick',
        ).length,
    ),
  ).toBe(stopped);
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: '张某与李某借款纠纷（示例）', exact: true }),
  ).toBeVisible();
});
