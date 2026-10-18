import { expect, test, type Page } from '@playwright/test';

const column = (page: Page, status: string) => page.locator(`[data-status-id="${status}"]`);
const card = (page: Page) => page.locator('[data-case-id="demo"]');

async function dragTo(page: Page, status: string) {
  const source = await card(page).boundingBox();
  const destination = await column(page, status).boundingBox();
  if (!source || !destination) throw new Error('看板未显示');
  await page.mouse.move(source.x + 30, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + 42, source.y + 20);
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 30, { steps: 12 });
  await expect(column(page, status)).toHaveClass(/is-drop-target/);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(card(page)).toBeVisible();
});

test('跨列拖动保存状态并更新数量，松手不会误打开案件', async ({ page }) => {
  await dragTo(page, 'closed');
  await expect(column(page, 'closed').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(column(page, 'closed').locator('header small')).toHaveText('1');
  await expect(column(page, 'in_progress').locator('header small')).toHaveText('0');
  await expect(page.getByRole('region', { name: '案件详情' })).toHaveCount(0);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(column(page, 'closed').locator('[data-case-id="demo"]')).toBeVisible();
  await card(page).click();
  await expect(page.getByRole('combobox', { name: '案件状态', exact: true })).toHaveAttribute(
    'data-value',
    'closed',
  );
  await expect(page.getByRole('region', { name: '办理概况' })).toContainText('庭前准备');
});

test('拖出看板或按 Escape 取消时保留原状态', async ({ page }) => {
  const source = (await card(page).boundingBox())!;
  await page.mouse.move(source.x + 30, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + 20);
  await page.mouse.move(1300, 650, { steps: 8 });
  await expect(page.locator('.is-drop-target')).toHaveCount(0);
  await page.mouse.up();
  await expect(column(page, 'in_progress').locator('[data-case-id="demo"]')).toBeVisible();
  await card(page).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(column(page, 'closed')).toHaveClass(/is-drop-target/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.is-drop-target')).toHaveCount(0);
  await expect(column(page, 'in_progress').locator('[data-case-id="demo"]')).toBeVisible();
});

test('触屏可横向拖动案件到另一个状态', async ({ page }) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const source = (await card(page).boundingBox())!;
  const destination = (await column(page, 'not_started').boundingBox())!;
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  await touch('touchStart', source.x + 45, source.y + 25);
  await touch('touchMove', source.x + 25, source.y + 25);
  await touch('touchMove', destination.x + 100, source.y + 25);
  await expect(column(page, 'not_started')).toHaveClass(/is-drop-target/);
  await touch('touchEnd');
  await expect(column(page, 'not_started').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(page.getByRole('region', { name: '案件详情' })).toHaveCount(0);
  await session.detach();
});

test('键盘可移动案件，窄屏选列时自动横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await card(page).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(column(page, 'closed')).toHaveClass(/is-drop-target/);
  await page.keyboard.press('Enter');
  await expect(column(page, 'closed').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(card(page)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(column(page, 'not_started').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(page.getByRole('region', { name: '案件详情' })).toHaveCount(0);
});

test('保存失败回到原列，保留案件内容并允许重新拖动', async ({ page }) => {
  await page.addInitScript(() => {
    let fail = true;
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'set_case_status' && fail) {
            fail = false;
            throw new Error('测试：磁盘不可写');
          }
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await dragTo(page, 'closed');
  await expect(page.getByRole('alert')).toContainText('案件已回到原来的列');
  await expect(column(page, 'in_progress').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(column(page, 'closed').locator('.case-card')).toHaveCount(0);
  await dragTo(page, 'not_started');
  await expect(column(page, 'not_started').locator('[data-case-id="demo"]')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('搜索和普通点击仍可用，空白列不撑满屏幕', async ({ page }) => {
  await page.getByRole('textbox', { name: '搜索案件' }).fill('没有这样的案件');
  await expect(page.locator('.case-card')).toHaveCount(0);
  await page.getByRole('textbox', { name: '搜索案件' }).fill('借款');
  await expect(card(page)).toBeVisible();
  const height = await column(page, 'closed').evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(height).toBeLessThan(100);
  await card(page).click();
  await expect(page.getByRole('textbox', { name: '案件名称' })).toHaveValue(
    '张某与李某借款纠纷（示例）',
  );
});
