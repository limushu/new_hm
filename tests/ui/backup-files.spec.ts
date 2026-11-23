import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function runtime(page: Page) {
  await page.addInitScript(() => {
    let exports = 0;
    let picks = 0;
    let restores = 0;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    Object.assign(window, {
      isTauri: true,
      backupCalls: calls,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name === 'subsystem_manifest')
            return {
              version: 1,
              subsystems: [
                { id: 'backup', state: 'ready', capabilities: ['local-backup', 'backup-files'] },
              ],
            };
          if (
            ['choose_backup_directory', 'pick_restore_backup', 'apply_restore_backup'].includes(
              name,
            )
          )
            throw new Error(`Unexpected desktop directory command: ${name}`);
          const summary = { createdAt: '2026-11-16T10:00:00Z', caseCount: 3, fileCount: 5 };
          if (name.endsWith('_backup_archive')) {
            calls.push({ name, args });
            if (name === 'export_backup_archive')
              return ++exports === 1 ? null : { name: 'anjian-backup.zip', summary };
            if (name === 'pick_backup_archive') {
              picks++;
              if (picks === 1) return null;
              if (picks === 2)
                throw {
                  kind: 'invalid-state',
                  code: 'legacy_error',
                  detail: '备份校验失败：materials/fictional.m4a',
                };
              return { token: `selection-${picks}`, summary };
            }
            if (name === 'restore_backup_archive') {
              restores++;
              if (restores === 1) throw { kind: 'invalid-state', code: 'backup_workspace_busy' };
              return summary;
            }
            return null;
          }
          const { previewCommand } = await import(
            new URL('/src/services/preview.ts', location.origin).href
          );
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).tap();
}

test('备份文件导出处理取消，恢复先显示摘要、显式确认并支持失败重试', async ({ page }) => {
  await runtime(page);
  const section = page
    .locator('.settings-section')
    .filter({ has: page.getByRole('heading', { name: '备份与恢复', exact: true }) });
  await expect(section).toContainText('系统文件选择器提供的云盘');
  await expect(section.getByRole('button', { name: '选择位置', exact: true })).toHaveCount(0);
  const exportButton = section.getByRole('button', { name: '导出完整备份', exact: true });
  await exportButton.tap();
  await expect(exportButton).toBeEnabled();
  await expect(section.getByRole('status')).toHaveCount(0);
  await exportButton.tap();
  await expect(section.getByRole('status')).toContainText('已导出 3 个案件、5 份文件');
  const restore = section.getByRole('button', { name: '从文件恢复', exact: true });
  await restore.tap();
  await expect(restore).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await restore.tap();
  await expect(section.getByRole('alert')).toContainText('备份校验失败');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await restore.tap();
  const dialog = page.getByRole('dialog', { name: '恢复完整备份' });
  await expect(dialog).toContainText('3 个案件、5 份文件');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { backupCalls: Array<{ name: string }> }).backupCalls.filter(
          (call) => call.name === 'restore_backup_archive',
        ).length,
    ),
  ).toBe(0);
  await dialog.getByRole('button', { name: '取消', exact: true }).tap();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { backupCalls: Array<{ name: string }> }).backupCalls.at(-1)?.name,
      ),
    )
    .toBe('discard_backup_archive');
  await restore.tap();
  await dialog.getByRole('button', { name: '确认恢复', exact: true }).tap();
  await expect(dialog.getByRole('alert')).toContainText('请先保存或放弃当前录音和转写稿');
  await dialog.getByRole('button', { name: '确认恢复', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(section.getByRole('status')).toContainText('备份已恢复');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { backupCalls: Array<{ name: string; args: Record<string, unknown> }> })
        .backupCalls,
  );
  expect(calls[0].args.dialogTitle).toContain('iCloud');
  const submissions = calls.filter((call) => call.name === 'restore_backup_archive');
  expect(submissions.map((call) => call.args)).toEqual([
    { token: 'selection-4', confirmed: true },
    { token: 'selection-4', confirmed: true },
  ]);
});

test('关闭备份预览时释放尚未确认的备份，不执行恢复', async ({ page }) => {
  await runtime(page);
  const restore = page.getByRole('button', { name: '从文件恢复', exact: true });
  await restore.tap();
  await expect(restore).toBeEnabled();
  await restore.tap();
  await expect(restore).toBeEnabled();
  await restore.tap();
  await page
    .getByRole('dialog', { name: '恢复完整备份' })
    .getByRole('button', { name: '关闭', exact: true })
    .tap();
  await page.getByRole('button', { name: '今天', exact: true }).tap();
  const calls = await page.evaluate(
    () => (window as unknown as { backupCalls: Array<{ name: string }> }).backupCalls,
  );
  expect(calls.filter((call) => call.name === 'discard_backup_archive')).toHaveLength(1);
  expect(calls.filter((call) => call.name === 'restore_backup_archive')).toHaveLength(0);
});
