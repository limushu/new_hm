import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('iOS 文件入口处理取消和读取错误，导入当前文件夹并支持预览及导出', async ({ page }) => {
  await page.addInitScript(() => {
    let picks = 0;
    Object.assign(window, {
      isTauri: true,
      documentCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
      __TAURI_INTERNALS__: {
        convertFileSrc: (path: string) => path,
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name === 'subsystem_manifest')
            return {
              version: 1,
              subsystems: [
                { id: 'documents', state: 'ready', capabilities: ['file-picker', 'file-export'] },
              ],
            };
          if (name === 'plugin:event|listen' || name === 'import_material_paths')
            throw new Error(`Unexpected desktop operation: ${name}`);
          const { previewCommand, registerPreviewFiles } = await import('/src/services/preview.ts');
          if (name === 'pick_materials') {
            (window as unknown as { documentCalls: unknown[] }).documentCalls.push({ name, args });
            picks++;
            if (picks === 1) return { imported: 0, errors: [] };
            if (picks === 2) throw { kind: 'io', code: 'document_read_failed' };
            return previewCommand('import_material_paths', {
              target: args.target,
              paths: registerPreviewFiles([
                new File(['provider audio fixture'], '系统导入.m4a', { type: 'audio/mp4' }),
              ]),
            });
          }
          if (name === 'export_material') {
            (window as unknown as { documentCalls: unknown[] }).documentCalls.push({ name, args });
            return false;
          }
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.getByRole('tab', { name: '材料', exact: true }).tap();
  const panel = page.locator('.materials-panel');
  await expect(panel).not.toContainText('拖入');
  await panel.getByRole('button', { name: '文件夹', exact: true }).tap();
  await page.getByLabel('文件夹名称').fill('iPhone 文件夹');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await panel.getByRole('button', { name: 'iPhone 文件夹', exact: true }).tap();
  const add = panel.getByRole('button', { name: '添加材料', exact: true });
  await add.tap();
  await expect(add).toBeEnabled();
  await expect(panel.locator('.material-row')).toHaveCount(0);
  await add.tap();
  await expect(panel.getByRole('alert')).toContainText('无法读取此文件');
  await add.tap();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.locator('.material-row')).toContainText('系统导入.m4a');
  await panel.getByRole('button', { name: '系统导入.m4a', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '预览 系统导入.m4a' })).toBeVisible();
  await page.getByRole('button', { name: '关闭预览' }).tap();
  await panel.getByRole('button', { name: '系统导入.m4a的操作' }).tap();
  await page.getByRole('menuitem', { name: '导出副本', exact: true }).tap();
  await expect(panel.locator('.material-row')).toContainText('系统导入.m4a');
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          documentCalls: Array<{ name: string; args: Record<string, unknown> }>;
        }
      ).documentCalls,
  );
  expect(calls.map((call) => call.name)).toEqual([
    'pick_materials',
    'pick_materials',
    'pick_materials',
    'export_material',
  ]);
  const target = calls[2].args.target as { caseId: string; parentId: string };
  expect(target.caseId).toBeTruthy();
  expect(target.parentId).toBeTruthy();
  expect(calls[2].args.dialogTitle).toContain('添加材料');
  expect(calls[3].args.id).toBeTruthy();
});
