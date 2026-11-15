import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ viewport: { width: 390, height: 844 } });
async function open(page: import('@playwright/test').Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
}
test('手机案件首屏显示脉络，快捷入口保存文档并按原文安全读取', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: '案件时间轴', exact: true })).toBeVisible();
  await expect(page.locator('.case-workspace-details')).not.toHaveAttribute('open');
  await expect(page.getByRole('navigation', { name: '案件快捷操作' })).toBeInViewport();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /新建文档/ }).click();
  await page.getByLabel('文档名称', { exact: true }).fill('沟通纪要');
  await page
    .getByLabel('文档正文', { exact: true })
    .fill('# 虚构纪要\n<script>window.unexpectedScript=true</script>\n核对材料');
  await page.getByRole('button', { name: '保存文档', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建文档', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查找案件材料', exact: true }).click();
  await page.getByLabel('搜索历史材料', { exact: true }).fill('沟通纪要');
  await page
    .locator('.case-found-materials')
    .getByRole('button', { name: /沟通纪要.md/ })
    .click();
  await expect(page.locator('.text-document-preview')).toContainText(
    '<script>window.unexpectedScript=true</script>',
  );
  expect(await page.evaluate(() => 'unexpectedScript' in window)).toBe(false);
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  await page
    .getByRole('dialog', { name: '查找案件材料', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '快速录音', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '案件录音', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeVisible();
});

test('关键事件保留发生日期，未来节点标为计划，相关人可直接进入', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /关键事件/ }).click();
  await page.getByLabel('事件名称', { exact: true }).fill('虚构借款交付');
  await page.getByLabel('事件日期', { exact: true }).fill('2024-06-02');
  await page.getByRole('button', { name: '保存事件', exact: true }).click();
  const entry = page.locator('.chronicle-entry').filter({ hasText: '虚构借款交付' });
  await expect(entry).toContainText('2024-06-02');
  await expect(entry).toContainText('发生日期');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /关键事件/ }).click();
  await page.getByLabel('事件名称', { exact: true }).fill('虚构后续沟通计划');
  await page.getByLabel('事件日期', { exact: true }).fill('2099-06-02');
  await page.getByRole('button', { name: '保存事件', exact: true }).click();
  await expect(
    page.locator('.chronicle-entry').filter({ hasText: '虚构后续沟通计划' }),
  ).toHaveCount(0);
  await page.locator('.chronicle-plans > summary').click();
  await expect(page.locator('.chronicle-plans')).toContainText('2099-06-02');
  await expect(
    page.locator('.chronicle-plans').getByRole('button').filter({ hasText: '虚构后续沟通计划' }),
  ).toContainText('计划');
  await page.locator('.chronicle-plans > summary').click();
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await expect(page.getByRole('region', { name: '本案关系', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '脉络', exact: true }).click();
  for (const width of [320, 390, 430, 760]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync('artifacts/case-chronicle', { recursive: true });
  await page.screenshot({ path: 'artifacts/case-chronicle/light.png' });
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.screenshot({ path: 'artifacts/case-chronicle/dark.png' });
});
