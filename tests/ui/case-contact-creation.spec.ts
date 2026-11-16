import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { selectOption } from './fields';
test.use({ viewport: { width: 390, height: 844 } });

async function openCase(page: Page) {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
}
async function chooseCourt(page: Page) {
  const type = page.getByRole('dialog', { name: '添加人员或机构', exact: true });
  await expect(type.getByLabel('对象名称', { exact: true })).toHaveCount(0);
  await type.getByRole('button', { name: '法院 案件涉及的法院', exact: true }).click();
  return page.getByRole('dialog', { name: '添加法院', exact: true });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});

test('先选类型、新建法院一次保存，取消不建档；不要求先有办理流程', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '人物或机构', exact: true }).click();
  let form = await chooseCourt(page);
  await form.getByLabel('对象名称', { exact: true }).fill('取消的法院');
  await form.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await page.getByRole('button', { name: '添加人员或机构', exact: true }).click();
  form = await chooseCourt(page);
  await form.getByLabel('对象名称', { exact: true }).fill('虚构便捷法院');
  await form.getByLabel('对象电话', { exact: true }).fill('010-00000000');
  await form.getByLabel('本案身份', { exact: true }).fill('受理法院');
  mkdirSync('artifacts/case-contact-creation', { recursive: true });
  await page.screenshot({ path: 'artifacts/case-contact-creation/new-court-dark.png' });
  await form.getByRole('button', { name: '新建并添加', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page.locator('.case-person-group').filter({ hasText: '法院与承办人' }),
  ).toContainText('虚构便捷法院');
  await expect(
    page.locator('.case-person-entry').filter({ hasText: '虚构便捷法院' }),
  ).toContainText('受理法院');
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await expect(page.locator('.contact-directory-row')).toHaveCount(1);
  await expect(page.locator('.contact-directory-row')).not.toContainText('取消的法院');
});

test('先按法院类型搜索全部存量档案，添加到本案不重复建档或重复关联', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  for (const [name, kind] of [
    ['存量法院', 'court'],
    ['其他机构', 'organization'],
  ]) {
    await page.getByRole('button', { name: '新建对象', exact: true }).click();
    await selectOption(page, page.getByLabel('对象类型', { exact: true }), kind);
    await page.getByLabel('对象名称', { exact: true }).fill(name);
    await page.getByRole('button', { name: '保存', exact: true }).click();
  }
  await openCase(page);
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '添加人员或机构', exact: true }).click();
    const form = await chooseCourt(page);
    await expect(form.getByRole('button', { name: /已有法院/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(form).not.toContainText('其他机构');
    await form.getByLabel('搜索已有法院', { exact: true }).fill('存量');
    await form.getByRole('button', { name: /存量法院/ }).click();
    await form.getByRole('button', { name: '添加到本案', exact: true }).click();
  }
  await expect(page.locator('.case-person-entry').filter({ hasText: '存量法院' })).toHaveCount(1);
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await expect(page.locator('.contact-directory-row')).toHaveCount(2);
  await expect(
    page.locator('.contact-directory-row').filter({ hasText: '存量法院' }),
  ).toContainText('1 个案件');
});

test('复用本案已有对象保留重要程度和标签，深浅主题的添加流程不溢出', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '人物或机构', exact: true }).click();
  let form = await chooseCourt(page);
  await form.getByLabel('对象名称', { exact: true }).fill('带属性的法院');
  await form.locator('.creation-properties > summary').click();
  await form.getByRole('checkbox', { name: '重要', exact: true }).check();
  await form.getByLabel('创建对象标签', { exact: true }).fill('保留标签');
  await form.getByRole('button', { name: '新建并添加', exact: true }).click();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '人物或机构', exact: true }).click();
  form = await chooseCourt(page);
  await form.getByRole('button', { name: /带属性的法院/ }).click();
  await form.locator('.creation-properties > summary').click();
  await expect(form.getByRole('checkbox', { name: '重要', exact: true })).toBeChecked();
  await expect(form.getByLabel('创建对象标签', { exact: true })).toHaveValue('保留标签');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await form.getByRole('button', { name: '添加到本案', exact: true }).click();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await openCase(page);
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await expect(page.locator('.case-person-entry').filter({ hasText: '带属性的法院' })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '添加人员或机构', exact: true }).click();
  mkdirSync('artifacts/case-contact-creation', { recursive: true });
  await page.screenshot({ path: 'artifacts/case-contact-creation/choose-type-light.png' });
  form = await chooseCourt(page);
  await form.getByRole('button', { name: /带属性的法院/ }).click();
  await page.screenshot({ path: 'artifacts/case-contact-creation/reuse-court-light.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
