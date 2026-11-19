import { expect, test } from '@playwright/test';
import { selectOption } from './fields';
test.use({ viewport: { width: 390, height: 844 } });
test('人物和部门关系可在本案建立，并进入关系图', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  for (const [name, kind] of [
    ['示例客户', 'person'],
    ['示例公司部门', 'organization'],
  ]) {
    await page.getByRole('button', { name: '新建对象', exact: true }).click();
    await page.getByLabel('对象名称', { exact: true }).fill(name);
    await selectOption(page, page.getByLabel('对象类型', { exact: true }), kind);
    await page
      .getByRole('dialog', { name: '新建联系对象', exact: true })
      .getByRole('button', { name: '保存', exact: true })
      .click();
  }
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '人员', exact: true }).click();
  await page.getByText('编辑人物与机构之间的关系', { exact: true }).click();
  await page.getByRole('button', { name: '添加关联', exact: true }).click();
  await selectOption(page, page.getByLabel('关联起点范围', { exact: true }), 'directory');
  await selectOption(page, page.getByLabel('关联起点类型', { exact: true }), 'person');
  await page.getByRole('radio', { name: '选择 示例客户', exact: true }).check();
  await selectOption(page, page.getByLabel('关联对象范围', { exact: true }), 'directory');
  await selectOption(page, page.getByLabel('关联对象类型', { exact: true }), 'organization');
  await page.getByRole('checkbox', { name: '选择 示例公司部门', exact: true }).check();
  await page.getByText('更多关系设置', { exact: true }).click();
  await selectOption(page, page.getByLabel('关系类型', { exact: true }), 'affiliated_with');
  await page.getByLabel('关联说明', { exact: true }).fill('任职于');
  await page.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(page.getByRole('region', { name: '本案人物与机构关系', exact: true })).toContainText(
    '任职于',
  );
  await page.getByRole('button', { name: '查看关系图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '案件关系图', exact: true })).toContainText(
    '示例公司部门',
  );
});
test('收支在时间轴和账目共用原始记录，重要程度与标签可组合筛选', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /记一笔收支/ }).click();
  await page.getByLabel('收支金额', { exact: true }).fill('123.45');
  await page.getByLabel('收支类别', { exact: true }).fill('交通费');
  await page.getByLabel('收支备注', { exact: true }).fill('出庭交通费（虚构）');
  await page
    .getByRole('dialog', { name: '记一笔收支', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  const entry = page.locator('.chronicle-entry').filter({ hasText: '出庭交通费（虚构）' });
  await expect(entry).toContainText('支出 ¥ 123.45');
  await entry.getByRole('button', { name: '条目操作 出庭交通费（虚构）', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑信息', exact: true }).click();
  await page.getByRole('checkbox', { name: '标为重要', exact: true }).check();
  await page.getByLabel('对象标签', { exact: true }).fill('差旅，报销');
  await page.getByRole('button', { name: '保存信息', exact: true }).click();
  await page
    .getByRole('dialog', { name: '对象详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('checkbox', { name: '只看重要条目', exact: true }).check();
  await selectOption(page, page.getByLabel('时间轴类型', { exact: true }), 'ledger');
  await selectOption(page, page.getByLabel('时间轴标签', { exact: true }), '差旅');
  await page
    .getByRole('dialog', { name: '筛选案件时间轴', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await expect(page.locator('.chronicle-entry')).toHaveCount(1);
  await entry
    .getByRole('button', { name: /出庭交通费（虚构）/ })
    .first()
    .click();
  await page.getByRole('button', { name: '编辑内容', exact: true }).click();
  await expect(page.getByLabel('收支金额', { exact: true })).toHaveValue('123.45');
  await page.getByLabel('收支金额', { exact: true }).fill('150');
  await page
    .getByRole('dialog', { name: '编辑收支', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(entry).toContainText('支出 ¥ 150.00');
  await page
    .getByRole('dialog', { name: '对象详情', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .last()
    .click();
  await page.getByRole('tab', { name: '费用', exact: true }).click();
  await expect(page.locator('.ledger-row')).toHaveCount(1);
  await expect(page.locator('.ledger-row')).toContainText('150.00');
});

test('条目关联使用同一份材料并保留原件预览', async ({ page }) => {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /新建文档/ }).click();
  await page.getByLabel('文档名称', { exact: true }).fill('案件分析');
  await page.getByLabel('文档正文', { exact: true }).fill('虚构分析依据');
  await page.getByRole('button', { name: '保存文档', exact: true }).click();
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: /关键事件/ }).click();
  await page.getByLabel('事件名称', { exact: true }).fill('完成证据梳理');
  await page.getByRole('button', { name: '保存事件', exact: true }).click();
  const entry = page.locator('.chronicle-entry').filter({ hasText: '完成证据梳理' });
  await entry.locator('.chronicle-entry-title').click();
  const details = page.getByRole('dialog', { name: '节点详情', exact: true });
  await details.getByRole('button', { name: '添加关联', exact: true }).click();
  await selectOption(page, page.getByLabel('关联对象类型', { exact: true }), 'document');
  await page.getByRole('checkbox', { name: '选择 案件分析.md', exact: true }).check();
  await page.getByLabel('关联说明', { exact: true }).fill('分析依据');
  await page.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(details.getByRole('region', { name: '条目关联', exact: true })).toContainText(
    '分析依据',
  );
  await details.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(entry).toContainText('案件分析.md');
  await entry.getByRole('button', { name: '案件分析.md', exact: true }).click();
  await expect(page.locator('.text-document-preview')).toContainText('虚构分析依据');
});
