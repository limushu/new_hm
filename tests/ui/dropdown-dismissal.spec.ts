import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});

test('触摸单选后立即收起，选择原值也收起，表单保留未保存内容', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).tap();
  await page.getByRole('button', { name: '新建对象', exact: true }).tap();
  const form = page.getByRole('dialog', { name: '新建联系对象', exact: true });
  await form.getByLabel('对象名称', { exact: true }).fill('未保存的档案');
  const type = form.getByRole('combobox', { name: '对象类型', exact: true });
  for (const label of ['法院', '法院', '个人']) {
    await type.tap();
    await page.getByRole('option', { name: label, exact: true }).tap();
    await expect(type).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(':popover-open')).toHaveCount(0);
    await expect(form.getByLabel('对象名称', { exact: true })).toHaveValue('未保存的档案');
  }
  await expect(form).toBeVisible();
});

test('已有法院候选选后收起并退出输入，直接再次点选可重新展开', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).tap();
  await page.getByRole('button', { name: '新建对象', exact: true }).tap();
  const type = page.getByRole('combobox', { name: '对象类型', exact: true });
  await type.tap();
  await page.getByRole('option', { name: '法院', exact: true }).tap();
  await page.getByLabel('对象名称', { exact: true }).fill('候选测试法院');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await page.getByRole('button', { name: '新建对象', exact: true }).tap();
  await type.tap();
  await page.getByRole('option', { name: '法官', exact: true }).tap();
  const picker = page.getByRole('combobox', { name: '法官关联法院', exact: true });
  for (let i = 0; i < 2; i++) {
    await picker.tap();
    await page.getByRole('option', { name: /候选测试法院/ }).tap();
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).not.toBeFocused();
    await expect(page.locator(':popover-open')).toHaveCount(0);
    // Remove the membership so the same directory entry remains selectable.
    await page.getByRole('button', { name: '解除候选测试法院的法院关系', exact: true }).tap();
  }
});

test('点选日期后收起并结束输入，不提交日程表单', async ({ page }) => {
  await page.getByRole('button', { name: '新建日程', exact: true }).tap();
  const input = page.getByLabel('开始日期', { exact: true });
  for (let i = 0; i < 2; i++) {
    await input.tap();
    const popup = page.getByRole('dialog', { name: '开始日期选择器', exact: true });
    await popup.getByRole('button', { name: '今天', exact: true }).tap();
    await expect(popup).toHaveCount(0);
    await expect(input).not.toBeFocused();
    await expect(page.getByRole('dialog', { name: '新建日程', exact: true })).toBeVisible();
  }
});

test('身份建议选后结束输入，仍需明确保存表单', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.getByRole('tab', { name: '人员', exact: true }).tap();
  await page
    .locator('.case-people-maintain > summary')
    .filter({ hasText: '维护当事人与关联对象' })
    .tap();
  await page.getByRole('button', { name: '添加当事人', exact: true }).tap();
  const form = page.getByRole('dialog', { name: '添加当事人', exact: true });
  const input = form.getByRole('combobox', { name: '服务身份', exact: true });
  await input.tap();
  await page.getByRole('option', { name: '代理', exact: true }).tap();
  await expect(input).not.toBeFocused();
  await expect(page.locator(':popover-open')).toHaveCount(0);
  await input.tap();
  await input.fill('');
  await page.getByRole('option', { name: '辩护', exact: true }).tap();
  await expect(input).toHaveValue('辩护');
  await expect(input).not.toBeFocused();
  await expect(page.locator(':popover-open')).toHaveCount(0);
  await expect(form).toBeVisible();
});
