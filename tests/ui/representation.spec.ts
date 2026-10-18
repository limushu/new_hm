import { expect, test, type Page } from '@playwright/test';
import { selectOption, openFlowDetails } from './fields';

async function addFlow(page: Page, kind: string) {
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await selectOption(page, page.getByLabel('流程模板', { exact: true }), kind);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
const parties = (page: Page) => page.getByRole('region', { name: '委托与当事人', exact: true });
async function editRole(page: Page, role: string) {
  await parties(page).getByRole('button', { name: '编辑客户甲', exact: true }).click();
  await page.getByRole('combobox', { name: '本流程身份', exact: true }).fill(role);
  await page
    .getByRole('dialog', { name: '编辑当事人', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
});
test('新建只有案件档案，身份按流程独立、概览使用关注流程而非浏览流程', async ({ page }) => {
  await page.getByRole('button', { name: '新建案件', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /建案时/ })).toHaveCount(0);
  await page.getByLabel('案件名称', { exact: true }).fill('身份验收（虚构）');
  await page.getByLabel('案件名称', { exact: true }).press('Enter');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  await expect(page.locator('.program-node')).toHaveCount(0);
  await addFlow(page, 'first_instance');
  await parties(page).getByRole('button', { name: '添加当事人', exact: true }).click();
  await page.getByLabel('当事人名称', { exact: true }).fill('客户甲');
  await page.getByRole('combobox', { name: '本流程身份', exact: true }).fill('原');
  await page.getByRole('option', { name: '原告', exact: true }).click();
  await page
    .getByRole('dialog', { name: '添加当事人', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(parties(page)).toContainText('原告');
  await addFlow(page, 'appeal');
  await expect(parties(page)).toContainText('本流程身份未填写');
  await editRole(page, '被上诉人');
  await page.getByRole('tab', { name: '办理', exact: true }).click();
  await page.getByRole('button', { name: '查看一审流程', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.getByRole('region', { name: '办理阶段' })).toHaveCount(1);
  await expect(parties(page)).toContainText('原告');
  await page.getByRole('tab', { name: '概况', exact: true }).click();
  await expect(parties(page)).toContainText('二审中的身份');
  await expect(parties(page)).toContainText('被上诉人');
  await expect(parties(page)).not.toContainText('原告');
  await page.getByRole('tab', { name: '办理', exact: true }).click();
  await page.getByRole('button', { name: '查看一审流程', exact: true }).click();
  await openFlowDetails(page);
  await page.getByRole('button', { name: '设为当前关注', exact: true }).click();
  await page.getByRole('tab', { name: '概况', exact: true }).click();
  await expect(parties(page)).toContainText('一审中的身份');
  await expect(parties(page)).toContainText('原告');
  await page.screenshot({ path: '.local/representation-overview.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await parties(page).getByRole('button', { name: '编辑客户甲', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '本流程身份' })).toHaveValue('原告');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.local/representation-mobile.png' });
});
test('自定义非诉模板可复用，修改模板不改历史实例，删除模板不删除流程', async ({ page }) => {
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await page.getByRole('button', { name: '自定义模板', exact: true }).click();
  await page.getByLabel('模板名称', { exact: true }).fill('专项尽调');
  await page.getByLabel('模板初始阶段', { exact: true }).fill('接收资料\n形成报告');
  await page
    .getByRole('dialog', { name: '新建流程模板', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.getByLabel('流程模板', { exact: true })).toContainText('专项尽调');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.locator('.program-detail-heading h2')).toHaveText('专项尽调');
  await expect(page.locator('.stage-chip').filter({ hasNotText: '全部阶段' })).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: '办理法院', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await page.getByRole('button', { name: '管理模板', exact: true }).click();
  await page.getByRole('button', { name: '编辑专项尽调模板', exact: true }).click();
  await page.getByLabel('模板名称', { exact: true }).fill('商业尽调');
  await page.getByLabel('模板初始阶段', { exact: true }).fill('启动');
  await page
    .getByRole('dialog', { name: '编辑流程模板', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '管理流程模板', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.locator('.stage-chip').filter({ hasNotText: '全部阶段' })).toHaveCount(1);
  await page.getByRole('button', { name: '查看专项尽调流程', exact: true }).click();
  await openFlowDetails(page);
  await expect(page.locator('.stage-chip').filter({ hasNotText: '全部阶段' })).toHaveCount(2);
  await page.getByRole('button', { name: '新增流程', exact: true }).click();
  await page.getByRole('button', { name: '管理模板', exact: true }).click();
  await page.getByRole('button', { name: '删除商业尽调模板', exact: true }).click();
  await page.getByRole('button', { name: '删除模板', exact: true }).click();
  await page
    .getByRole('dialog', { name: '管理流程模板', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.work-programs > button')).toHaveCount(3);
});
test('角色可先记录不强迫建立联系对象，删除可恢复案件保留所有身份', async ({ page }) => {
  await page.locator('.case-card').first().click();
  await parties(page).getByRole('button', { name: '添加当事人', exact: true }).click();
  await page.getByRole('combobox', { name: '本流程身份', exact: true }).fill('第三人');
  await page
    .getByRole('dialog', { name: '添加当事人', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(parties(page)).toContainText('姓名待补充');
  await expect(parties(page)).toContainText('第三人');
  await page.getByRole('button', { name: '删除案件', exact: true }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await expect(parties(page)).toContainText('第三人');
});
