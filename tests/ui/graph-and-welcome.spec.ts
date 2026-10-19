import { test, expect, type Page } from '@playwright/test';
import { selectOption } from './fields';

async function contacts(page: Page) {
  await page.goto('/?preview=1');
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  for (const [name, kind] of [
    ['示例法院', 'court'],
    ['示例法官', 'judge'],
    ['独立机构', 'organization'],
  ]) {
    await page.getByRole('button', { name: '新建对象', exact: true }).click();
    await page.getByLabel('对象名称', { exact: true }).fill(name);
    await selectOption(page, page.getByLabel('对象类型', { exact: true }), kind);
    if (kind === 'judge') {
      await page.getByRole('combobox', { name: '法官关联法院', exact: true }).fill('示例法院');
      await page.getByRole('option', { name: /示例法院/ }).click();
    }
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新建联系对象', exact: true })).toHaveCount(0);
  }
}

test('图内选择保留上下文，关联可沿节点探索，详情独立打开，筛选不制造关系', async ({ page }) => {
  await contacts(page);
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '全局关系图', exact: true });
  const court = dialog.getByRole('button', { name: '查看示例法院', exact: true });
  await court.click();
  const inspector = dialog.getByRole('region', { name: '选中节点的关系' });
  await expect(inspector).toContainText('法院 · 法官');
  await expect(dialog).toBeVisible();
  await inspector.getByRole('button', { name: /示例法官/ }).click();
  await expect(dialog.getByRole('button', { name: '查看示例法官', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await inspector.getByRole('button', { name: '以此为中心', exact: true }).click();
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const control = dialog.getByRole('combobox', { name: '关系图层级', exact: true });
    const label = dialog.locator('.graph-depth');
    await expect(control).toBeVisible();
    const dimensions = await label.evaluate((n) => ({
      label: n.getBoundingClientRect().height,
      control: n.querySelector('button')!.getBoundingClientRect().height,
    }));
    expect(dimensions.label).toBeLessThanOrEqual(dimensions.control + 2);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(dialog.getByRole('button', { name: '局部', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByRole('button', { name: '查看独立机构', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '全局', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '查看独立机构', exact: true })).toBeVisible();
  await dialog
    .getByRole('group', { name: '关系图节点类型', exact: true })
    .getByRole('button', { name: '法院', exact: true })
    .click();
  await expect(court).toHaveCount(0);
  await expect(dialog.locator('.graph-edge')).toHaveCount(1); // only the demo case/flow edge remains
  await dialog.getByLabel('搜索关系图', { exact: true }).fill('不存在的节点');
  await expect(dialog).toContainText('没有匹配的节点');
  await dialog.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(court).toBeVisible();
  await inspector.getByRole('button', { name: '打开对象详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '示例法官', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '对象资料' })).toContainText('示例法官');
});

test('节点拖动与画布平移分别工作，滚轮缩放、重置、键盘与窄屏可用', async ({ page }) => {
  await contacts(page);
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '全局关系图', exact: true });
  const node = dialog.getByRole('button', { name: '查看示例法院', exact: true });
  const original = await node.getAttribute('transform');
  const dot = await node.locator('.graph-dot').boundingBox();
  if (!dot) throw new Error('节点不可见');
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(dot.x + dot.width / 2 + 60, dot.y + dot.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('transform', original!);
  await expect(dialog).toBeVisible();
  const svg = dialog.locator('.graph-canvas > svg');
  const canvas = await svg.boundingBox();
  if (!canvas) throw new Error('画布不可见');
  const world = svg.locator(':scope > g');
  await page.mouse.move(canvas.x + 15, canvas.y + 15);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 55, canvas.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(world).not.toHaveAttribute('transform', 'translate(0 0) scale(1)');
  await page.mouse.wheel(0, -180);
  await expect(dialog.getByLabel('关系图缩放比例', { exact: true })).not.toHaveText('100%');
  await dialog.getByRole('button', { name: '重置关系图', exact: true }).click();
  await expect(world).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  await expect(node).toHaveAttribute('transform', original!);
  await svg.focus();
  await page.keyboard.press('+');
  await expect(dialog.getByLabel('关系图缩放比例', { exact: true })).toHaveText('120%');
  await page.keyboard.press('Home');
  await expect(dialog.getByLabel('关系图缩放比例', { exact: true })).toHaveText('100%');
  const darkFill = await node.locator('.graph-dot').evaluate((n) => getComputedStyle(n).fill);
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '联系对象', exact: true }).click();
  await page.getByRole('button', { name: '关系图', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await node.locator('.graph-dot').evaluate((n) => getComputedStyle(n).fill)).not.toBe(
    darkFill,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByLabel('搜索关系图', { exact: true })).toBeVisible();
  expect(await dialog.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await dialog.getByRole('button', { name: '展开关系图', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '收起关系图', exact: true })).toBeVisible();
});

test('首次欢迎可立即跳过，减少动画设置下仍可进入', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?preview=1&welcome=1');
  const welcome = page.getByRole('dialog', { name: '欢迎使用案笺', exact: true });
  await expect(welcome).toBeVisible();
  expect(await welcome.locator('img').evaluate((n) => getComputedStyle(n).animationName)).toBe(
    'none',
  );
  await welcome.getByRole('button', { name: '跳过', exact: true }).click();
  await expect(welcome).toHaveCount(0);
  await page.getByRole('button', { name: '案件', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(1);
});

test('欢迎动画不阻塞操作，Escape 能完成，普通升级预览不显示欢迎', async ({ page }) => {
  await page.goto('/?preview=1');
  await expect(page.getByRole('button', { name: '案件', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '欢迎使用案笺', exact: true })).toHaveCount(0);
  await page.goto('/?preview=1&welcome=1');
  const welcome = page.getByRole('dialog', { name: '欢迎使用案笺', exact: true });
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toHaveCount(0);
});
