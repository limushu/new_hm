import { expect, test } from '@playwright/test';

test('手机案件 Tab 再次进入保留材料搜索与视图，主导航保留看板', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  const board = await page.locator('.case-board').elementHandle();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  expect(await board!.evaluate((node) => node === document.querySelector('.case-board'))).toBe(
    true,
  );
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  const materialSearch = page.locator('.material-search input');
  const search = await materialSearch.elementHandle();
  await materialSearch.fill('保留的检索条件');
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  await expect(materialSearch).toHaveValue('保留的检索条件');
  expect(
    await search!.evaluate((node) => node === document.querySelector('.material-search input')),
  ).toBe(true);
});

test('手机卡片滑动交给原生滚动，只有手柄捕获拖动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page
    .locator('.case-card')
    .first()
    .evaluate((card) => {
      card.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 4,
          pointerType: 'touch',
          button: 0,
          clientX: 200,
          clientY: 250,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 4,
          pointerType: 'touch',
          clientX: 80,
          clientY: 250,
        }),
      );
    });
  await expect(page.locator('.case-drag-preview')).toHaveCount(0);
  await expect(page.locator('.case-card').first()).toHaveCSS('touch-action', 'auto');
});

test.describe('触摸编辑后的案件导航', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('修改状态与阶段后连续浏览不重复加载数据、不累积弹层', async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(window, {
        isTauri: true,
        workspaceReads: 0,
        __TAURI_INTERNALS__: {
          invoke: async (name: string, args: unknown) => {
            if (name === 'subsystem_manifest') return { version: 1, subsystems: [] };
            if (name === 'load_workspace')
              (window as unknown as { workspaceReads: number }).workspaceReads++;
            const { previewCommand } = await import('/src/services/preview.ts');
            return previewCommand(name, args);
          },
        },
      });
    });
    await page.goto('/?preview=1');
    await page.getByRole('button', { name: '案件', exact: true }).tap();
    await page.locator('.case-card').first().tap();
    const status = page.getByRole('combobox', { name: '案件状态', exact: true });
    expect(
      await status.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await status.tap();
    await page.getByRole('option').filter({ hasText: '#已结案' }).tap();
    await expect(status).toHaveAttribute('data-value', 'closed');
    await expect(status).not.toBeFocused();
    await page.getByRole('tab', { name: '办理', exact: true }).tap();
    await page.getByRole('button', { name: '调整阶段状态', exact: true }).tap();
    await page.getByRole('combobox', { name: '阶段状态', exact: true }).tap();
    await page.getByRole('option', { name: '已完成', exact: true }).tap();
    await page.getByRole('button', { name: '应用', exact: true }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const before = await page.evaluate(
      () => (window as unknown as { workspaceReads: number }).workspaceReads,
    );
    for (let round = 0; round < 3; round++) {
      for (const name of ['概况', '材料', '费用', '办理']) {
        const tab = page.getByRole('tab', { name, exact: true });
        await tab.tap();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }
      for (const name of ['立案', '举证', '全部阶段', '庭前准备']) {
        const chip = page.locator('.stage-strip').getByRole('button', { name, exact: true });
        await chip.tap();
        await expect(chip).toHaveAttribute('aria-pressed', 'true');
      }
    }
    expect(
      await page.evaluate(() => (window as unknown as { workspaceReads: number }).workspaceReads),
    ).toBe(before);
    await expect(page.locator(':popover-open')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
