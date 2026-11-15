import { expect, test } from '@playwright/test';
import { selectOption } from './fields';
test.use({ viewport: { width: 390, height: 844 } });
test('关键节点可独立创建，公共属性随对象保存，本地存量材料可以挂到节点', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await expect(page.getByRole('tab', { name: '办理', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '关系', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /关键节点/ }).click();
  await page.getByLabel('节点名称', { exact: true }).fill('一审·主诉');
  await page.getByRole('checkbox', { name: '重要', exact: true }).check();
  await page.getByLabel('创建对象标签', { exact: true }).fill('审理节点');
  await page.getByRole('button', { name: '保存节点', exact: true }).click();
  const node = page.locator('.chronicle-entry').filter({ hasText: '一审·主诉' });
  await expect(node).toContainText('日期未设置');
  await expect(node).toContainText('#审理节点');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /导入本地材料/ }).click();
  await page.getByRole('checkbox', { name: '重要', exact: true }).check();
  await page.getByLabel('创建对象标签', { exact: true }).fill('证据');
  await selectOption(page, page.getByLabel('创建对象关联节点', { exact: true }), {
    label: '一审·主诉',
  });
  await page.getByLabel('选择本地材料', { exact: true }).setInputFiles({
    name: '原有转账记录.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构原有材料内容'),
  });
  await expect(
    page.getByRole('dialog', { name: '导入本地材料', exact: true }).getByRole('status'),
  ).toContainText('已归档 1 份材料');
  await page
    .getByRole('dialog', { name: '导入本地材料', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  const file = page
    .locator('.chronicle-entry[data-resource^="material:"]')
    .filter({ hasText: '原有转账记录.txt' });
  await expect(file).toContainText('#证据');
  await node.locator('.chronicle-entry-title').click();
  await expect(page.getByRole('dialog', { name: '节点详情', exact: true })).toContainText(
    '原有转账记录.txt',
  );
  await page
    .getByRole('dialog', { name: '节点详情', exact: true })
    .getByRole('button', { name: /^原有转账记录\.txt/ })
    .click();
  await expect(page.locator('.text-document-preview')).toContainText('虚构原有材料内容');
});
