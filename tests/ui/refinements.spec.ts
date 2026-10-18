import { expect, test } from '@playwright/test';
import { selectOption } from './fields';

test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
});
test('对象名称先打开资料，筛选和表单菜单共用深色样式且 Escape 不关闭表单', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.getByRole('button', { name: '新建对象', exact: true }).click();
  await page.getByLabel('对象名称', { exact: true }).fill('资料优先（虚构）');
  const type = page.getByRole('combobox', { name: '对象类型', exact: true });
  await type.click();
  await expect(page.getByRole('listbox')).toHaveCSS('background-color', 'rgb(39, 39, 39)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '新建联系对象', exact: true })).toBeVisible();
  await page.getByLabel('对象电话').fill('示例电话');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.row-main').filter({ hasText: '资料优先（虚构）' }).click();
  await expect(page.getByRole('region', { name: '对象资料' })).toContainText('示例电话');
  await expect(page.locator('.entity-links-layout')).toHaveCount(0);
  await page.getByRole('button', { name: '反向关联', exact: true }).click();
  await expect(page.locator('.entity-links-layout')).toContainText('关联案件后');
});
test('从详情编辑、取消和删除时不嵌套表单、不刷新页面，列表删除仍可用', async ({ page }) => {
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.getByRole('button', { name: '新建对象', exact: true }).click();
  await page.getByLabel('对象名称', { exact: true }).fill('详情编辑验收');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.locator('.row-main').click();
  await page.getByRole('button', { name: '编辑对象', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '详情编辑验收', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑对象', exact: true }).click();
  await page.getByLabel('对象电话', { exact: true }).fill('编辑后保存的电话');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('region', { name: '对象资料' })).toContainText('编辑后保存的电话');
  await page.getByRole('button', { name: '删除对象', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '详情编辑验收', exact: true });
  await expect(detail).toBeVisible();
  expect(await page.locator('form form').count()).toBe(0);
  await detail.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.locator('.contact-directory-row').hover();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除联系对象', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click();
  await expect(page.locator('.contact-directory-row')).toHaveCount(0);
  await expect(page).toHaveURL(/preview=1/);
});
test('有案件和法官关系的法院可直接删除，案件原记录保留', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '流程详情', exact: true }).click();
  await page.getByRole('combobox', { name: '办理法院', exact: true }).fill('可删除法院');
  await page.getByRole('button', { name: '新建「可删除法院」', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建联系对象', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toHaveValue(
    '可删除法院',
  );
  await page.getByRole('combobox', { name: '承办法官', exact: true }).fill('保留法官');
  await page.getByRole('button', { name: '新建「保留法官」', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  const row = page
    .locator('.contact-directory-row')
    .filter({ has: page.locator('.row-main > span').filter({ hasText: '可删除法院' }) });
  await row.locator('.row-main').click();
  await page.getByRole('button', { name: '删除对象', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '删除联系对象', exact: true });
  await expect(confirm).toContainText('1 条案件关联和 1 条对象关系');
  await confirm.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.contact-directory-row')).toHaveCount(1);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '流程详情', exact: true }).click();
  await expect(page.locator('.program-contacts')).toContainText('原记录：可删除法院');
});
test('卡片删除先确认，可取消和撤销，键盘可操作且回收站可恢复', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  const card = page.locator('.case-card').first();
  const remove = page.getByRole('button', {
    name: '删除案件「张某与李某借款纠纷（示例）」',
    exact: true,
  });
  await remove.click();
  await expect(page.getByRole('region', { name: '案件详情' })).toHaveCount(0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(card).toBeVisible();
  await remove.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(card).toBeVisible();
  await remove.click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(card).toBeVisible();
});
test('新增待办和日程共用日期编辑器，整块点击选日期、直接输入和校验', async ({ page }) => {
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByLabel('待办内容', { exact: true }).fill('准备开庭材料');
  const date = page.getByRole('textbox', { name: '截止日期', exact: true });
  await date.click();
  const picker = page.getByRole('dialog', { name: '截止日期选择器', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: '今天', exact: true }).click();
  await date.fill('2026-02-30');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建待办', exact: true })).toBeVisible();
  await date.fill('2026/11/08');
  await date.press('Tab');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.locator('.todo-row').filter({ hasText: '准备开庭材料' })).toContainText(
    '2026-11-08',
  );
  await page.getByRole('button', { name: '返回看板', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '新建日程', exact: true }).click();
  await page.getByLabel('开始日期', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: '开始日期选择器', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '新建日程', exact: true })).toBeVisible();
  await selectOption(page, page.getByLabel('日程提醒时间'), '15');
  await expect(page.getByLabel('日程提醒时间')).toHaveAttribute('data-value', '15');
});
