import type { Locator, Page } from '@playwright/test';
export async function selectOption(page: Page, field: Locator, option: string | { label: string }) {
  const name = await field.getAttribute('aria-label');
  await field.click();
  const list = page.getByRole('listbox', { name: `${name}选项`, exact: true });
  if (typeof option === 'string')
    await list.locator(`[role="option"][data-value="${option}"]`).click();
  else await list.getByRole('option', { name: option.label }).click();
}
