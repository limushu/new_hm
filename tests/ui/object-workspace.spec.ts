import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { selectOption } from './fields';
test.use({ viewport: { width: 390, height: 844 } });
async function openCase(page: import('@playwright/test').Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
}
test('节点的自定义属性与值可编辑，能从节点直接新建律师并关联，人员名册可找到', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /关键节点/ }).click();
  await page.getByLabel('节点名称', { exact: true }).fill('一审·审理');
  await page.getByRole('button', { name: '保存节点', exact: true }).click();
  const row = page.locator('.chronicle-entry').filter({ hasText: '一审·审理' });
  await row.locator('.chronicle-entry-title').click();
  let node = page.getByRole('dialog', { name: '节点详情', exact: true });
  await node.getByRole('button', { name: '添加属性', exact: true }).click();
  let form = page.getByRole('dialog', { name: '添加属性', exact: true });
  await form.getByLabel('属性名称', { exact: true }).fill('审理结果');
  await selectOption(page, form.getByLabel('属性类型', { exact: true }), 'select');
  await form.getByLabel('属性选项', { exact: true }).fill('待宣判，部分支持，调解');
  await selectOption(page, form.getByLabel('属性值', { exact: true }), { label: '部分支持' });
  await form.getByRole('button', { name: '保存属性', exact: true }).click();
  const property = node.locator('.object-property-row').filter({ hasText: '审理结果' });
  await expect(property).toContainText('部分支持');
  await node.getByRole('button', { name: '添加关联', exact: true }).click();
  const association = page.getByRole('dialog', { name: '添加案件关联', exact: true });
  await selectOption(page, association.getByLabel('关联对象类型', { exact: true }), 'person');
  await association.getByRole('button', { name: '新建人物并关联', exact: true }).click();
  form = page.getByRole('dialog', { name: '添加个人', exact: true });
  await form.getByLabel('对象名称', { exact: true }).fill('周律师');
  await form.getByLabel('本案身份', { exact: true }).fill('我方代理律师');
  await form.getByRole('button', { name: '新建并添加', exact: true }).click();
  // The previous reader is retained but only the active editor is exposed.
  const retainedNode = page.locator('dialog[aria-label="节点详情"]');
  await expect(retainedNode).toBeHidden();
  await expect(retainedNode).not.toContainText('周律师');
  await association.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(node.locator('.resource-related-object')).toContainText(['周律师']);
  await node.getByRole('button', { name: '关闭', exact: true }).last().click();
  await row.locator('.chronicle-entry-title').click();
  node = page.getByRole('dialog', { name: '节点详情', exact: true });
  await expect(node).toContainText('部分支持');
  await node.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '切换当前关注节点', exact: true }).click();
  const focus = page.getByRole('dialog', { name: '选择当前关注节点', exact: true });
  await selectOption(page, focus.getByLabel('当前关注节点', { exact: true }), {
    label: '一审·审理',
  });
  await focus.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.case-focus-main')).toContainText('部分支持');
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await expect(page.locator('.case-person-group').filter({ hasText: '律师' })).toContainText(
    '周律师',
  );
  await expect(page.locator('.case-people-panel .relationship-graph')).toHaveCount(0);
  mkdirSync('artifacts/object-workspace', { recursive: true });
  await page.screenshot({ path: 'artifacts/object-workspace/people.png' });
});
test('关联属性使用同一套对象关系，删除属性保留新建人物', async ({ page }) => {
  await openCase(page);
  await page.locator('.case-focus-main').click();
  let node = page.getByRole('dialog', { name: '节点详情', exact: true });
  await node.getByRole('button', { name: '添加属性', exact: true }).click();
  let form = page.getByRole('dialog', { name: '添加属性', exact: true });
  await form.getByLabel('属性名称', { exact: true }).fill('代理律师');
  await selectOption(page, form.getByLabel('属性类型', { exact: true }), 'relation');
  await selectOption(page, form.getByLabel('关联对象类型', { exact: true }), 'person');
  await form.getByRole('button', { name: '新建人物', exact: true }).click();
  const propertyForm = form;
  form = page.getByRole('dialog', { name: '添加个人', exact: true });
  await form.getByLabel('对象名称', { exact: true }).fill('赵律师');
  await form.getByLabel('本案身份', { exact: true }).fill('我方律师');
  await form.getByRole('button', { name: '新建并添加', exact: true }).click();
  await expect(propertyForm).toContainText('赵律师');
  await expect(node.locator('.object-property-main')).toHaveCount(0);
  await propertyForm.getByRole('button', { name: '保存属性', exact: true }).click();
  await expect(node.locator('.object-property-main').filter({ hasText: '代理律师' })).toContainText(
    '1 个关联对象',
  );
  await node.getByRole('button', { name: '编辑属性 代理律师', exact: true }).click();
  await page.getByRole('button', { name: '删除此属性', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除属性', exact: true })
    .getByRole('button', { name: '删除属性', exact: true })
    .click();
  await expect(node.locator('.object-property-main')).toHaveCount(0);
  await node.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await expect(page.locator('.case-people-panel')).toContainText('赵律师');
});
test('手机今日默认清单，案件卡片保留进度和近期事项', async ({ page }) => {
  await page.goto('/?preview=1');
  await expect(page.getByLabel('日历视图', { exact: true })).toContainText('清单');
  await expect(page.locator('.calendar-view-agenda')).toBeVisible();
  await expect(page.locator('.time-grid')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '本周日期' })).toBeVisible();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  const card = page.locator('.mobile-case-item').first();
  await expect(card).toContainText('一审');
  await page.screenshot({ path: 'artifacts/object-workspace/cases.png' });
});
