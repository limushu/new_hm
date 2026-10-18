import { expect, test, type Page } from '@playwright/test';

async function newCase(page: Page, name: string) {
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByLabel('案件名称', { exact: true }).fill(name);
  await page.getByLabel('案件名称', { exact: true }).press('Enter');
  await expect(page.locator('.save-state')).toHaveText('已保存');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
});

test('标签输入联想，默认回车复用已有项，移除后候选仍可再次选择', async ({ page }) => {
  const tags = page.getByRole('combobox', { name: '案件标签', exact: true });
  for (const name of ['#合同纠纷', '#劳动争议']) {
    await tags.fill(name);
    await tags.press('Enter');
    await expect(
      page.getByRole('button', { name: `移除标签${name.slice(1)}`, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await newCase(page, '联想标签验收');
  await tags.fill('#合同');
  await expect(page.getByRole('option', { name: '#合同纠纷', exact: true })).toBeVisible();
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: '移除标签合同纠纷', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '移除标签合同', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '移除标签合同纠纷', exact: true }).click();
  await tags.click();
  await expect(page.getByRole('option', { name: '#合同纠纷', exact: true })).toBeVisible();
  await page.getByRole('option', { name: '#劳动争议', exact: true }).click();
  await expect(page.getByRole('button', { name: '移除标签劳动争议', exact: true })).toBeVisible();
});

test('案件状态原位创建并同步看板，另一案件搜索复用同一状态而非重复建列', async ({ page }) => {
  const state = page.getByRole('combobox', { name: '案件状态', exact: true });
  await state.fill('#等待反馈');
  await expect(page.getByRole('option', { name: '创建 #等待反馈', exact: true })).toBeVisible();
  await state.press('Enter');
  await expect(state).toHaveValue('#等待反馈');
  await expect(state).toBeEnabled();
  const id = await state.getAttribute('data-value');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.case-column')).toHaveCount(4);
  await expect(page.getByRole('region', { name: '等待反馈案件', exact: true })).toContainText(
    '张某与李某',
  );
  await newCase(page, '状态复用验收');
  await state.fill('等');
  await expect(page.getByRole('option', { name: '#等待反馈', exact: true })).toBeVisible();
  await state.press('ArrowDown');
  await state.press('Enter');
  await expect(state).toHaveAttribute('data-value', id!);
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await expect(page.locator('.case-column')).toHaveCount(4);
  await expect(
    page.getByRole('region', { name: '等待反馈案件', exact: true }).locator('.case-card'),
  ).toHaveCount(2);
});

test('中文输入法回车不提交，Escape 不改变状态；窄屏联想菜单不越界', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const tags = page.getByRole('combobox', { name: '案件标签', exact: true });
  await tags.fill('#输入法验收');
  await tags.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.getByRole('button', { name: '移除标签输入法验收', exact: true })).toHaveCount(
    0,
  );
  await tags.press('Escape');
  await expect(page.getByRole('listbox', { name: '已有案件标签' })).toHaveCount(0);
  const state = page.getByRole('combobox', { name: '案件状态', exact: true });
  const id = await state.getAttribute('data-value');
  await state.click();
  await state.press('Enter');
  await expect(state).toHaveAttribute('data-value', id!);
  await state.fill('#待确认');
  const menu = page.getByRole('listbox', { name: '案件状态选项', exact: true });
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await state.press('Escape');
  await expect(state).toHaveAttribute('data-value', id!);
  await expect(page.getByRole('region', { name: '案件详情' })).toBeVisible();
});
