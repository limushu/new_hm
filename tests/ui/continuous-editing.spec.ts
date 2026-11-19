import { expect, test } from '@playwright/test';
import { selectOption } from './fields';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('slow writes permit continuous edits without losing tags, status, draft title or scroll position', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let release!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.assign(window, {
      isTauri: true,
      releaseHeaderWrites: () => release(),
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          if (name === 'subsystem_manifest') return { version: 1, subsystems: [] };
          if (name === 'update_case') await pendingWrite;
          const { previewCommand } = await import(
            new URL('/src/services/preview.ts', location.origin).href
          );
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  const title = page.getByLabel('案件名称', { exact: true });
  const original = await title.inputValue();
  await title.fill('还未确认的案件名称');
  const tags = page.getByLabel('案件标签', { exact: true });
  for (const tag of ['连续编辑甲', '连续编辑乙', '连续编辑丙']) {
    await tags.fill(tag);
    await tags.press('Enter');
    await expect(tags).toBeEnabled();
  }
  const status = page.getByLabel('案件状态', { exact: true });
  await status.tap();
  await page.getByRole('option').filter({ hasText: '#已结案' }).tap();
  await expect(status).toHaveAttribute('data-value', 'closed');
  await expect(page.getByRole('button', { name: '取消修改', exact: true })).toBeDisabled();
  const scroll = await page.locator('.case-body').evaluate((body) => {
    body.scrollTop = Math.min(80, body.scrollHeight - body.clientHeight);
    return body.scrollTop;
  });
  await page.evaluate(() =>
    (window as unknown as { releaseHeaderWrites: () => void }).releaseHeaderWrites(),
  );
  await expect(page.locator('.save-state')).toHaveText('名称待保存');
  expect(await page.locator('.case-body').evaluate((body) => body.scrollTop)).toBe(scroll);
  await expect(title).toHaveValue('还未确认的案件名称');
  for (const tag of ['连续编辑甲', '连续编辑乙', '连续编辑丙'])
    await expect(page.getByRole('button', { name: `移除标签${tag}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消修改', exact: true }).tap();
  await page.getByRole('button', { name: '返回看板', exact: true }).tap();
  await expect(page.locator('.mobile-case-item').first()).toContainText(original);
  await page.locator('.case-card').first().tap();
  await expect(status).toHaveAttribute('data-value', 'closed');
  for (const tag of ['连续编辑甲', '连续编辑乙', '连续编辑丙'])
    await expect(page.getByRole('button', { name: `移除标签${tag}`, exact: true })).toBeVisible();
});

test('association scope is explicit and cancelling inline creation retains the selected object and relationship draft', async ({
  page,
}) => {
  const reconciliationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('same key'))
      reconciliationErrors.push(message.text());
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '联系对象', exact: true }).tap();
  await page.getByRole('button', { name: '新建对象', exact: true }).tap();
  await page.getByLabel('对象名称', { exact: true }).fill('存量王律师');
  await page.getByLabel('对象电话', { exact: true }).fill('13800001234');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
  await page.locator('.case-focus-main').tap();
  const node = page.getByRole('dialog', { name: '节点详情', exact: true });
  await node.getByRole('button', { name: '添加关联', exact: true }).tap();
  const relation = page.getByRole('dialog', { name: '添加案件关联', exact: true });
  await expect(relation.getByRole('button', { name: '保存关联', exact: true })).toBeDisabled();
  await selectOption(page, relation.getByLabel('关联对象类型', { exact: true }), 'person');
  await expect(relation.getByLabel('选择 存量王律师', { exact: true })).toHaveCount(0);
  await selectOption(page, relation.getByLabel('关联对象范围', { exact: true }), 'directory');
  await relation.getByLabel('搜索关联对象', { exact: true }).fill('1234');
  const selected = relation.getByLabel('选择 存量王律师', { exact: true });
  await selected.check();
  await relation.getByLabel('关联说明', { exact: true }).fill('我方代理律师');
  await relation.getByRole('button', { name: '新建人物并关联', exact: true }).tap();
  const create = page.getByRole('dialog', { name: '添加个人', exact: true });
  await create.getByLabel('对象名称', { exact: true }).fill('取消的新对象');
  await create.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(selected).toBeChecked();
  await expect(relation.getByLabel('关联说明', { exact: true })).toHaveValue('我方代理律师');
  await expect(relation.getByLabel('搜索关联对象', { exact: true })).toHaveValue('1234');
  await relation.getByRole('button', { name: '保存关联', exact: true }).tap();
  await expect(node).toContainText('存量王律师');
  await expect(node).not.toContainText('取消的新对象');
  expect(reconciliationErrors).toEqual([]);
});
