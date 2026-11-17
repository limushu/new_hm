import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './fields';
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
async function runtime(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    let permission = 'not-determined';
    const links = new Map<string, Record<string, unknown>>();
    const copies = new Set<string>();
    const status = () => ({
      notifications: {
        installed: true,
        authorization: permission,
        enabled: true,
        scheduled: 0,
        deferred: 0,
        errorCode: null,
      },
      calendar: {
        installed: true,
        authorization: 'not-determined',
        linked: links.size,
        failed: 0,
        errorCode: null,
      },
    });
    Object.assign(window, {
      isTauri: true,
      deviceAgendaCalls: calls,
      calendarCopies: copies,
      __TAURI_INTERNALS__: {
        invoke: async (name: string, args: Record<string, unknown>) => {
          if (name.startsWith('agenda_')) {
            calls.push(name);
            if (name === 'agenda_status' || name === 'agenda_refresh') return status();
            if (name === 'agenda_request_notifications') {
              permission = 'denied';
              return permission;
            }
            if (name === 'agenda_calendar_link') return links.get(String(args.eventId)) ?? null;
            if (name === 'agenda_calendar_targets')
              return [{ id: 'writable', title: '虚构系统日历' }];
            if (name === 'agenda_calendar_attach') {
              const link = {
                eventId: args.eventId,
                targetId: args.targetId,
                targetTitle: '虚构系统日历',
                externalId: 'copy-' + args.eventId,
                errorCode: null,
              };
              links.set(String(args.eventId), link);
              copies.add(String(args.eventId));
              return link;
            }
            if (name === 'agenda_calendar_detach') {
              links.delete(String(args.eventId));
              return null;
            }
            return null;
          }
          const { previewCommand } = await import(
            new URL('/src/services/preview.ts', location.origin).href
          );
          const result = await previewCommand(name, args);
          if (name === 'subsystem_manifest')
            result.subsystems.push({
              id: 'agenda',
              state: 'ready',
              capabilities: ['system-notifications', 'system-calendar'],
            });
          return result;
        },
      },
    });
  });
  await page.goto('/?preview=1');
  await expect(page.getByRole('button', { name: '新建日程', exact: true })).toBeEnabled();
}
test('saving a reminder requests notification permission only on action; denial still saves the event', async ({
  page,
}) => {
  await runtime(page);
  expect(
    await page.evaluate(() =>
      (window as unknown as { deviceAgendaCalls: string[] }).deviceAgendaCalls.filter(
        (n) => n === 'agenda_request_notifications',
      ),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: '新建日程', exact: true }).tap();
  await page.getByLabel('日程名称', { exact: true }).fill('提醒权限拒绝后仍保存');
  await selectOption(page, page.getByLabel('日程提醒时间', { exact: true }), '15');
  await page.getByRole('button', { name: '保存日程', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^提醒权限拒绝后仍保存/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '日程已保存' })).toContainText(
    '系统提醒未开启',
  );
  expect(
    await page.evaluate(() =>
      (window as unknown as { deviceAgendaCalls: string[] }).deviceAgendaCalls.filter(
        (n) => n === 'agenda_request_notifications',
      ),
    ),
  ).toHaveLength(1);
});
test('system calendar is explicit, uses one mapping, and detaching preserves the external copy', async ({
  page,
}) => {
  await runtime(page);
  await page.getByRole('button', { name: '新建日程', exact: true }).tap();
  await page.getByLabel('日程名称', { exact: true }).fill('系统日历关联验收');
  await page.getByRole('button', { name: '保存日程', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as unknown as { deviceAgendaCalls: string[] }).deviceAgendaCalls.filter(
        (n) => n === 'agenda_calendar_targets',
      ),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: /^系统日历关联验收/ }).tap();
  await page.getByRole('button', { name: '添加到系统日历', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '添加到系统日历', exact: true });
  await expect(dialog.getByLabel('系统日历', { exact: true })).toContainText('虚构系统日历');
  await dialog.getByRole('button', { name: '添加日程', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '添加到系统日历', exact: true }).tap();
  const linked = page.getByRole('dialog', { name: '系统日历关联', exact: true });
  await expect(linked).toContainText('已关联：虚构系统日历');
  await linked.getByRole('button', { name: '取消关联并保留副本', exact: true }).tap();
  expect(
    await page.evaluate(
      () => (window as unknown as { calendarCopies: Set<string> }).calendarCopies.size,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { deviceAgendaCalls: string[] }).deviceAgendaCalls.filter(
        (n) => n === 'agenda_request_notifications',
      ),
    ),
  ).toHaveLength(0);
  await expect(page).toHaveURL(/\?preview=1/);
});
