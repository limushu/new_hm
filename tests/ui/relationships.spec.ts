import { selectOption } from './fields';
import { expect, test, type Page } from '@playwright/test';
async function addContact(page: Page, name: string, kind: string, court?: string) {
  await page.getByRole('button', { name: '新建对象', exact: true }).click();
  await page.getByLabel('对象名称', { exact: true }).fill(name);
  await selectOption(page, page.getByLabel('对象类型', { exact: true }), kind);
  if (court) {
    await page.getByRole('combobox', { name: '法官关联法院', exact: true }).fill(court);
    await page.getByRole('option', { name: new RegExp(court) }).click();
  }
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建联系对象', exact: true })).toHaveCount(0);
}
async function openInfo(page: Page) {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '流程详情', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});
test('点击侧页外返回，命名草稿保存、空白草稿取消，点击侧页内不误关闭', async ({ page }) => {
  await openInfo(page);
  await page.getByLabel('案号', { exact: true }).click();
  await page.getByLabel('案号', { exact: true }).fill('侧页外保存案号');
  await expect(page.locator('.case-page')).toBeVisible();
  await page
    .getByRole('button', { name: '返回主页面', exact: true })
    .click({ position: { x: 30, y: 300 } });
  await expect(page.locator('.case-page')).toHaveCount(0);
  await openInfo(page);
  await expect(page.getByLabel('案号', { exact: true })).toHaveValue('侧页外保存案号');
  await page
    .getByRole('button', { name: '返回主页面', exact: true })
    .click({ position: { x: 30, y: 300 } });
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page.getByLabel('案件名称', { exact: true }).fill('侧页外保存（虚构）');
  await page
    .getByRole('button', { name: '返回主页面', exact: true })
    .click({ position: { x: 30, y: 300 } });
  await expect(page.locator('.case-card').filter({ hasText: '侧页外保存（虚构）' })).toHaveCount(1);
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await page
    .getByRole('button', { name: '返回主页面', exact: true })
    .click({ position: { x: 30, y: 300 } });
  await expect(page.locator('.case-card')).toHaveCount(2);
});
test('法院法官搜索复用、筛选与反向关联，无需重复建档或手动再关联', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await addContact(page, '示例甲法院', 'court');
  await addContact(page, '示例乙法院', 'court');
  await addContact(page, '示例甲法官', 'judge', '示例甲法院');
  await addContact(page, '示例乙法官', 'judge', '示例乙法院');
  await openInfo(page);
  await page.getByRole('combobox', { name: '办理法院', exact: true }).fill('甲法院');
  await page.getByRole('option', { name: /示例甲法院/ }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '示例甲法院',
  );
  await page.getByRole('combobox', { name: '承办法官', exact: true }).click();
  await expect(page.getByRole('option', { name: /示例乙法官/ })).toHaveCount(0);
  await page.getByRole('option', { name: /示例甲法官/ }).click();
  await expect(page.getByRole('combobox', { name: '承办法官', exact: true })).toHaveValue(
    '示例甲法官',
  );
  await page.getByRole('button', { name: '查看法院关联', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '示例甲法院', exact: true });
  await expect(dialog).toContainText('示例甲法官');
  await expect(dialog).toContainText('张某与李某借款纠纷（示例）');
  await dialog.getByRole('button', { name: /示例甲法官/ }).click();
  dialog = page.getByRole('dialog', { name: '示例甲法官', exact: true });
  await expect(dialog).toContainText('示例甲法院');
  await dialog.getByRole('button', { name: '局部关系图', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '查看示例甲法院', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '放大关系图', exact: true }).click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await selectOption(page, page.getByLabel('流程模板', { exact: true }), 'appeal');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: '办理法院', exact: true }).fill('乙法院');
  await page.getByRole('option', { name: /示例乙法院/ }).click();
  await page.getByRole('button', { name: '查看一审流程', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '示例甲法院',
  );
  await expect(page.getByRole('combobox', { name: '承办法官', exact: true })).toHaveValue(
    '示例甲法官',
  );
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await expect(page.locator('.contact-directory-row')).toHaveCount(4);
});
test('流程内新建对象立即关联，已有名称联想支持键盘，手机详情不溢出', async ({ page }) => {
  await openInfo(page);
  await page.getByRole('combobox', { name: '办理法院', exact: true }).fill('虚构新法院');
  await page.getByRole('button', { name: '新建「虚构新法院」', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '虚构新法院',
  );
  await page.getByRole('combobox', { name: '承办法官', exact: true }).fill('虚构新法官');
  await page.getByRole('button', { name: '新建「虚构新法官」', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '承办法官', exact: true })).toHaveValue(
    '虚构新法官',
  );
  await page.getByRole('combobox', { name: '办理法院', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.case-page')).toBeVisible();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '查看虚构新法官的1个关联案件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '虚构新法官', exact: true });
  await expect(dialog).toContainText('虚构新法院');
  await dialog.getByRole('button', { name: '局部关系图', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(dialog.getByRole('button', { name: '查看虚构新法官', exact: true })).toBeVisible();
});
