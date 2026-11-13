import { expect, test, type Page } from '@playwright/test';

async function openMaterials(page: Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await page.locator('.case-card').first().click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
}

const image = {
  name: '借条照片.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  ),
};

test.describe('触摸材料操作', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('点击添加、单击预览、菜单移动，无需拖拽或双击', async ({ page }) => {
    await openMaterials(page);
    const panel = page.getByRole('region', { name: '案件材料' });
    await expect(panel).toContainText('点击“添加材料”');
    await expect(panel).not.toContainText('拖入');
    const picker = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: '添加材料', exact: true }).tap();
    await (await picker).setFiles(image);
    await panel.getByRole('button', { name: image.name, exact: true }).tap();
    await expect(page.getByRole('dialog', { name: `预览 ${image.name}` })).toBeVisible();
    await page.getByRole('button', { name: '关闭预览' }).tap();

    await panel.getByRole('button', { name: '文件夹', exact: true }).tap();
    await page.getByLabel('文件夹名称').fill('手机归档');
    await page.getByRole('button', { name: '保存', exact: true }).tap();
    await panel.getByRole('button', { name: `${image.name}的操作` }).tap();
    await page.getByRole('menuitem', { name: '移动到…', exact: true }).tap();
    await page.getByRole('combobox', { name: '目标文件夹' }).click();
    await page.getByRole('option', { name: '手机归档', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(panel.getByRole('button', { name: image.name, exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: '手机归档', exact: true }).tap();
    await expect(panel.getByRole('button', { name: image.name, exact: true })).toBeVisible();

    for (const width of [320, 390, 430, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      const controls = panel.locator(
        '.material-toolbar button, .material-name, .material-menu-trigger',
      );
      for (const box of await controls.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height),
      ))
        expect(box).toBeGreaterThanOrEqual(44);
      expect(
        await panel.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });

  test('触摸布局忽略文件拖放，平板横屏也不启用拖入', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openMaterials(page);
    const panel = page.locator('.materials-panel');
    await expect(panel).toHaveClass(/materials-touch/);
    await expect(panel).not.toContainText('拖入');
    await panel.evaluate((node) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['ignored'], '不应导入.txt', { type: 'text/plain' }));
      node.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    });
    await expect(panel).not.toHaveClass(/is-file-drop/);
    await expect(panel.locator('.material-row')).toHaveCount(0);
  });
});

test('桌面仍可拖入文件并双击预览，切换窄屏后改为点击', async ({ page }) => {
  await openMaterials(page);
  const panel = page.locator('.materials-panel');
  await expect(panel).toContainText('拖入文件');
  await panel.evaluate((node) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['image'], '桌面图片.png', { type: 'image/png' }));
    node.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
  });
  const file = panel.getByRole('button', { name: '桌面图片.png', exact: true });
  await expect(file).toBeVisible();
  await file.click();
  await expect(page.getByRole('dialog', { name: '预览 桌面图片.png' })).toHaveCount(0);
  await file.dblclick();
  await expect(page.getByRole('dialog', { name: '预览 桌面图片.png' })).toBeVisible();
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await file.click();
  await expect(page.getByRole('dialog', { name: '预览 桌面图片.png' })).toBeVisible();
});
