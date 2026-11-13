import { expect, test } from '@playwright/test';

test('手机设置中可离线阅读隐私政策，关闭后保留设置页', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '隐私政策', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '案笺隐私政策' });
  await expect(dialog).toBeVisible();
  const policy = dialog.getByRole('article', { name: '隐私政策正文' });
  await expect(policy).toContainText('应用不向开发者上传这些内容');
  await expect(policy).toContainText('系统设备备份');
  await expect(policy).toContainText('移入回收站的内容仍可恢复');
  await policy.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(policy.getByRole('heading', { name: '联系我们与政策更新' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
});
