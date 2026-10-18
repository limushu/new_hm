import { expect, test, type Page } from '@playwright/test';

async function openMaterials(page: Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
}

async function folder(page: Page, name: string) {
  await page.getByRole('button', { name: '文件夹', exact: true }).click();
  await page.getByLabel('文件夹名称').fill(name);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.material-list').getByRole('button', { name, exact: true }).click();
}

test('材料使用单一归档导航，多级路径可返回，新增始终落在显示的位置', async ({ page }) => {
  await openMaterials(page);
  await expect(page.locator('.proceeding-path')).toHaveCount(0);
  const scopes = page.getByRole('navigation', { name: '按流程查看材料' });
  await scopes.getByRole('button', { name: /^一审/ }).click();
  await folder(page, '证据');
  await folder(page, '书证');
  const breadcrumb = page.getByRole('navigation', { name: '材料路径' });
  await expect(breadcrumb).toHaveText('一审证据书证');
  await expect(page.getByRole('button', { name: '添加材料', exact: true })).toHaveAttribute(
    'title',
    '添加到 一审 / 证据 / 书证',
  );
  await page.getByLabel('选择材料文件').setInputFiles({
    name: '借条扫描.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构材料'),
  });
  await expect(page.locator('.material-row')).toHaveCount(1);
  await breadcrumb.getByRole('button', { name: '证据', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(1);
  await expect(page.locator('.material-row')).toContainText('书证');
  await breadcrumb.getByRole('button', { name: '全部材料', exact: true }).click();
  await expect(breadcrumb).toHaveText('一审');
  await scopes.getByRole('button', { name: /^案件共用/ }).click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await expect(breadcrumb).toHaveText('案件共用');
  await scopes.getByRole('button', { name: /^一审/ }).click();
  await page.locator('.material-list').getByRole('button', { name: '证据', exact: true }).click();
  await page.locator('.material-list').getByRole('button', { name: '书证', exact: true }).click();
  await expect(page.locator('.material-row')).toContainText('借条扫描.txt');
});

test('材料正文与操作保持可读字号，深浅主题及窄侧页不靠缩小字体适配', async ({ page }) => {
  await openMaterials(page);
  await page.getByLabel('选择材料文件').setInputFiles({
    name: '借款合同与转账记录（虚构示例）.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('虚构材料'),
  });
  await expect(page.locator('.material-row')).toHaveCount(1);
  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: '返回看板', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.getByRole('button', { name: '案件', exact: true }).click();
    await page.locator('.case-card').first().click();
    await page.getByRole('tab', { name: '材料', exact: true }).click();
    for (const width of [1600, 1024, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const panel = page.locator('.materials-panel');
      for (const selector of [
        '.material-name',
        '.material-search input',
        '.material-scopes button',
        '.material-toolbar button',
        '.material-breadcrumb button',
      ]) {
        const sizes = await panel
          .locator(selector)
          .evaluateAll((nodes) => nodes.map((n) => parseFloat(getComputedStyle(n).fontSize)));
        expect(sizes.every((size) => size >= 16)).toBe(true);
      }
      const titleColor = await panel.locator('h2').evaluate((n) => getComputedStyle(n).color);
      await expect(panel.locator('.material-name')).toHaveCSS('color', titleColor);
      await expect(panel.locator('.material-row > time')).toHaveCSS('color', titleColor);
      await expect(panel.getByRole('button', { name: '添加材料', exact: true })).toBeVisible();
      const overflow = await panel.evaluate((n) => n.scrollWidth - n.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
});
