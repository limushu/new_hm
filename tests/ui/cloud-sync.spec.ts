import { expect, test } from '@playwright/test';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('incoming cloud updates wait for a visible editor and then refresh the workspace', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    let applied = false;
    Object.assign(window, {
      isTauri: true,
      syncCalls: calls,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name.startsWith('sync_')) {
            calls.push(name);
            if (name === 'sync_presence') return null;
            if (name === 'sync_apply_pending') {
              if (args.token !== 'incoming-test') throw new Error('Wrong token');
              applied = true;
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
  });
  await page.goto('/?preview=1');
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

test('the editor gate ignores hidden retained views and searches but blocks dialogs and real editors', async ({
  page,
}) => {
  await page.goto('/?preview=1');
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
