import { expect, test } from '@playwright/test';
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      isTauri: true,
      workspaceReads: 0,
      failHeader: false,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: unknown) => {
          const w = window as unknown as { workspaceReads: number; failHeader: boolean };
          if (name === 'subsystem_manifest') return { version: 1, subsystems: [] };
          if (name === 'load_workspace') w.workspaceReads++;
          if (name === 'update_case' && w.failHeader) throw 'Header save failed';
          const { previewCommand } = await import('/src/services/preview.ts');
          return previewCommand(name, args);
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).tap();
  await page.locator('.case-card').first().tap();
});
test('标签、已有和新建状态就地保存，切换页签保持位置且不重读工作区', async ({ page }) => {
  const reads = () =>
    page.evaluate(() => (window as unknown as { workspaceReads: number }).workspaceReads);
  const before = await reads();
  const tags = page.getByLabel('案件标签', { exact: true });
  for (const name of ['刑事', '案件']) {
    await tags.fill(name);
    await tags.press('Enter');
    await expect(page.getByRole('button', { name: `移除标签${name}`, exact: true })).toBeVisible();
    await expect(tags).toBeEnabled();
    await expect(tags).not.toBeFocused();
  }
  const status = page.getByLabel('案件状态', { exact: true });
  await status.tap();
  await page.getByRole('option').filter({ hasText: '#已结案' }).tap();
  await expect(status).toBeEnabled();
  await expect(status).toHaveAttribute('data-value', 'closed');
  await status.fill('待收材料');
  await status.press('Enter');
  await expect(status).toBeEnabled();
  await expect(status).toHaveValue('#待收材料');
  await page.getByRole('button', { name: '移除标签刑事', exact: true }).tap();
  await expect(tags).toBeEnabled();
  await expect(page.locator('.case-tag-chips')).not.toContainText('#刑事');
  await page.getByLabel('案件名称', { exact: true }).fill('头部增量保存验收');
  await page.getByRole('button', { name: '保存名称', exact: true }).tap();
  await expect(page.locator('.save-state')).toHaveText('已保存');
  const top = await page.locator('.case-tabs').evaluate((e) => e.getBoundingClientRect().top);
  for (const name of ['材料', '人员', '费用', '脉络']) {
    const tab = page.getByRole('tab', { name, exact: true });
    await tab.tap();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(
      await page.locator('.case-tabs').evaluate((e) => e.getBoundingClientRect().top),
    ).toBeCloseTo(top, 0);
  }
  expect(await reads()).toBe(before);
  await expect(page.locator(':popover-open')).toHaveCount(0);
  await page.getByRole('button', { name: '返回看板', exact: true }).tap();
  await expect(page.locator('.mobile-case-item').first()).toContainText('待收材料');
  await expect(page.locator('.mobile-case-item').first()).toContainText('#案件');
  await expect(page.locator('.mobile-case-item').first()).toContainText('头部增量保存验收');
  await page.locator('.case-card').first().tap();
  await expect(status).toHaveValue('#待收材料');
  await expect(page.locator('.case-tag-chips')).toContainText('#案件');
  expect(await reads()).toBe(before);
});
test('标签保存失败时还原，错误显示后可以重试', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { failHeader: boolean }).failHeader = true;
  });
  const tags = page.getByLabel('案件标签', { exact: true });
  await tags.fill('未保存标签');
  await tags.press('Enter');
  await expect(page.locator('.case-page [role="alert"]')).toContainText('Header save failed');
  await expect(page.getByRole('button', { name: '移除标签未保存标签', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    (window as unknown as { failHeader: boolean }).failHeader = false;
  });
  await tags.fill('重试成功');
  await tags.press('Enter');
  await expect(page.getByRole('button', { name: '移除标签重试成功', exact: true })).toBeVisible();
  await expect(tags).toBeEnabled();
  await expect(page.locator('.case-page [role="alert"]')).toHaveCount(0);
});
