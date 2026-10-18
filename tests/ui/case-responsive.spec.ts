import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './fields';

async function expectPaneFits(page: Page) {
  const geometry = await page.locator('.case-page').evaluate((pane) => ({
    width: pane.clientWidth,
    scrollWidth: pane.scrollWidth,
    right: pane.getBoundingClientRect().right,
    viewport: innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  const fields = await page
    .locator('.program-fields > label, .program-relation-field')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const row = node.getBoundingClientRect();
        const control = node
          .querySelector('.select-field, .contact-picker, input')!
          .getBoundingClientRect();
        return {
          left: control.left,
          right: control.right,
          rowRight: row.right,
          y: row.y,
          bottom: row.bottom,
        };
      }),
    );
  expect(fields).toHaveLength(4);
  for (let i = 0; i < fields.length; i++) {
    expect(Math.abs(fields[i].left - fields[0].left)).toBeLessThanOrEqual(1);
    expect(fields[i].right).toBeLessThanOrEqual(fields[i].rowRight + 1);
    if (i) expect(fields[i].y).toBeGreaterThanOrEqual(fields[i - 1].bottom);
  }
}

test('流程详情按侧页实际宽度适配，小桌面、展开和手机均可操作', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await selectOption(page, page.getByLabel('流程模板', { exact: true }), 'appeal');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.program-detail-heading h2')).toHaveText('二审');
  await page
    .getByLabel('案号', { exact: true })
    .fill('（2026）这是用于小窗口验收的较长案号 0123456789 号');
  await page.getByLabel('案号', { exact: true }).press('Tab');
  await expect(page.locator('.save-state')).toHaveText('已保存');

  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
    { width: 760, height: 600 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await expectPaneFits(page);
    await page.getByRole('button', { name: '举证', exact: true }).click();
    await expect(page.locator('.program-current-stage')).toContainText('举证');
    // A selected stage opens the adjustment dialog; return to another stage for the next size.
    await page.getByRole('button', { name: '立案', exact: true }).click();
    await page.getByLabel('前序流程', { exact: true }).click();
    const menu = page.getByRole('listbox', { name: '前序流程选项', exact: true });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.getByLabel('前序流程', { exact: true }).press('Escape');
    await page.getByRole('button', { name: '查看一审流程', exact: true }).click();
    await expect(page.locator('.program-detail-heading h2')).toHaveText('一审');
    await page.getByRole('button', { name: '查看二审流程', exact: true }).click();
    await expect(page.getByLabel('案号', { exact: true })).toHaveValue(/较长案号/);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: '展开案件', exact: true }).click();
  await expectPaneFits(page);
  await page.getByRole('button', { name: '展开办理路径', exact: true }).click();
  await expect(page.locator('.program-edges')).toBeVisible();
  await expectPaneFits(page);
});

test('窄屏长阶段名、法院搜索和管理弹窗不挤出窗口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '流程详情', exact: true }).click();
  await page.getByRole('button', { name: '管理阶段', exact: true }).click();
  await page.getByRole('button', { name: '新增阶段', exact: true }).click();
  const name = '核对全部证据材料并联系委托人确认补充说明'.repeat(3);
  await page.getByLabel('阶段名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '管理办理阶段', exact: true });
  expect(await manager.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  await manager.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.program-current-stage')).toContainText(name);
  await expectPaneFits(page);
  await page.getByRole('combobox', { name: '办理法院', exact: true }).fill('未录入的法院');
  const picker = page.locator('.picker-popover');
  await expect(picker).toBeVisible();
  // Search changes the menu height; wait for the shared ResizeObserver positioning pass.
  await expect
    .poll(async () => {
      const box = await picker.boundingBox();
      return box ? box.y + box.height : Infinity;
    })
    .toBeLessThanOrEqual(700);
  const box = await picker.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(700);
  // Scrolling the anchor away must not move the shared menu beyond the window.
  await page.locator('.case-page').evaluate((pane) => {
    pane.scrollTop = 0;
  });
  await expect
    .poll(async () => {
      const box = await picker.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= 700;
    })
    .toBe(true);
  await page.getByRole('combobox', { name: '办理法院', exact: true }).press('Escape');
  await expect(page.getByRole('region', { name: '案件详情' })).toBeVisible();
});
