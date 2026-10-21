import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('手机纵向案件列表支持搜索、状态筛选、创建和恢复删除', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await expect(page.locator('.case-board')).toHaveCount(0);
  await expect(page.locator('.mobile-case-item')).toHaveCount(1);
  const filters = page.getByRole('navigation', { name: '按案件状态筛选' });
  await filters.getByRole('button', { name: /^已结案/ }).tap();
  await expect(page.getByRole('heading', { name: '这个状态下还没有案件' })).toBeVisible();
  await filters.getByRole('button', { name: /^全部/ }).tap();
  await page.getByRole('textbox', { name: '搜索案件' }).fill('没有结果');
  await expect(page.getByRole('heading', { name: '没有匹配的案件' })).toBeVisible();
  await page.getByRole('button', { name: '清除案件搜索' }).tap();
  await page.getByRole('button', { name: '新建', exact: true }).tap();
  await page.getByLabel('案件名称', { exact: true }).fill('手机创建的合同纠纷');
  await page.getByLabel('案件名称', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '返回看板', exact: true }).tap();
  await expect(page.locator('.mobile-case-item')).toHaveCount(2);
  await page.getByRole('button', { name: '案件操作「手机创建的合同纠纷」' }).tap();
  await page.getByRole('button', { name: '已结案', exact: true }).tap();
  await filters.getByRole('button', { name: /^已结案/ }).tap();
  await expect(page.locator('.mobile-case-item')).toHaveCount(1);
  await expect(page.locator('.mobile-case-item')).toContainText('手机创建的合同纠纷');
  await page.locator('.mobile-case-more').tap();
  await page.getByRole('button', { name: '移入回收站', exact: true }).tap();
  await page
    .getByRole('dialog', { name: '删除案件' })
    .getByRole('button', { name: '移入回收站' })
    .tap();
  await expect(page.locator('.mobile-case-item')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).tap();
  await expect(page.locator('.mobile-case-item')).toHaveCount(1);
});

test('手机长标题与自定义状态完整显示，深浅主题不溢出', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.getByRole('button', { name: '管理案件状态' }).tap();
  await page.getByRole('button', { name: '新增状态', exact: true }).tap();
  await page.getByLabel('状态名称', { exact: true }).fill('等待客户补充材料');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await expect(page.getByRole('navigation', { name: '按案件状态筛选' })).toContainText(
    '等待客户补充材料',
  );
  await page.locator('.case-card').first().tap();
  await page
    .getByLabel('案件名称', { exact: true })
    .fill('某公司与某商贸公司买卖合同纠纷及财产保全案件（手机列表长标题示例）');
  await page.getByLabel('案件名称', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '返回看板', exact: true }).tap();
  for (const width of [320, 390, 430, 760]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const card = await page.locator('.mobile-case-item').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(16);
    expect(card!.x + card!.width).toBeLessThanOrEqual(width - 16);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync('artifacts/mobile-cases', { recursive: true });
  await page.screenshot({ path: 'artifacts/mobile-cases/dark.png', fullPage: true });
  await page.getByRole('button', { name: '设置', exact: true }).tap();
  await page.getByRole('button', { name: '浅色', exact: true }).tap();
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.screenshot({ path: 'artifacts/mobile-cases/light.png', fullPage: true });
});
