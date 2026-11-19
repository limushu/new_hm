import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
async function openCase(page: Page) {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
}
async function expectFooter(page: Page) {
  const footer = page.getByRole('navigation', { name: '案件快捷操作', exact: true });
  const pane = page.getByRole('region', { name: '案件详情', exact: true });
  const geometry = await footer.evaluate((node) => {
    const rect = node.getBoundingClientRect(),
      parent = node.closest('.case-page')!.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      parent: parent.bottom,
      viewport: innerHeight,
      width: innerWidth,
      left: rect.left,
      right: rect.right,
    };
  });
  expect(Math.abs(geometry.bottom - geometry.viewport)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.parent - geometry.viewport)).toBeLessThanOrEqual(1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  await expect(footer.getByRole('button', { name: '创建', exact: true })).toBeInViewport();
  expect(await pane.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
}
test('案件操作栏在短内容、长内容与四个标签里始终贴底，末条内容可读', async ({ page }) => {
  await page.goto('/?preview=1');
  await openCase(page);
  for (const size of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 852, height: 393 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    for (const tab of ['脉络', '材料', '人员', '费用']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expectFooter(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await page.locator('.case-body').evaluate((node) => {
    const fixture = document.createElement('div');
    fixture.id = 'long-content';
    for (let n = 0; n < 60; n++) {
      const p = document.createElement('p');
      p.textContent = `虚构材料说明 ${n}`;
      p.style.padding = '12px 0';
      fixture.append(p);
    }
    node.append(fixture);
  });
  await expectFooter(page);
  await page.locator('.case-page').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expectFooter(page);
  const last = await page.locator('#long-content > p:last-child').boundingBox();
  const bar = await page.getByRole('navigation', { name: '案件快捷操作' }).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y + 1);
});
test('全屏背景覆盖视口，安全区留给状态与手势，横屏仍为手机布局', async ({ page }) => {
  await page.goto('/?preview=1');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--safe-top', '59px');
    root.style.setProperty('--safe-bottom', '34px');
  });
  await openCase(page);
  await expectFooter(page);
  const toolbar = await page.locator('.case-toolbar').boundingBox();
  expect(toolbar!.y).toBeGreaterThanOrEqual(59);
  const button = await page
    .getByRole('navigation', { name: '案件快捷操作' })
    .getByRole('button', { name: '创建', exact: true })
    .boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(844 - 34);
  mkdirSync('artifacts/appearance', { recursive: true });
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await page.screenshot({ path: 'artifacts/appearance/materials-safe-area-dark.png' });
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--safe-top', '0px');
    root.style.setProperty('--safe-bottom', '21px');
    root.style.setProperty('--safe-left', '59px');
    root.style.setProperty('--safe-right', '59px');
  });
  await expectFooter(page);
  const field = await page.getByLabel('案件名称', { exact: true }).boundingBox();
  expect(field!.x).toBeGreaterThanOrEqual(59);
  expect(field!.x + field!.width).toBeLessThanOrEqual(852 - 59);
  await page.getByRole('combobox', { name: '案件状态', exact: true }).click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const popup = await menu.boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(59);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(852 - 59);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /工作记录/ }).click();
  const modal = page.getByRole('dialog', { name: '添加工作记录', exact: true });
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(59);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(852 - 59);
  // The sheet background reaches the screen edge; actions avoid the gesture area.
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(393);
  const saveRecord = await modal
    .getByRole('button', { name: '保存记录', exact: true })
    .boundingBox();
  expect(saveRecord!.y + saveRecord!.height).toBeLessThanOrEqual(393 - 21);
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.mobile-case-workspace')).toBeVisible();
});
test('预设、自选强调色全局生效且重启保留，取消和恢复默认行为明确', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '蓝灰', exact: true }).click();
  await expect(page.getByRole('button', { name: '蓝灰', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const readFill = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim(),
    );
  const blue = await readFill();
  await page.getByRole('button', { name: '自选颜色', exact: true }).click();
  await page.getByLabel('强调色代码', { exact: true }).fill('#ff0000');
  await page
    .getByRole('dialog', { name: '自选强调色', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  expect(await readFill()).toBe(blue);
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '蓝灰', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '自选颜色', exact: true }).click();
  await page.getByLabel('强调色代码', { exact: true }).fill('#fff300');
  await page.getByRole('button', { name: '应用颜色', exact: true }).click();
  await expect.poll(readFill).not.toBe(blue);
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const yellowLight = await readFill();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  const primary = page.getByRole('button', { name: '新建日程', exact: true });
  const styles = await primary.evaluate((node) => ({
    fill: getComputedStyle(node).backgroundColor,
    text: getComputedStyle(node).color,
  }));
  expect(styles.fill).not.toBe(styles.text);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await readFill()).not.toBe(yellowLight);
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.getByRole('button', { name: '青绿', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'artifacts/appearance/accent-settings-dark.png' });
});
