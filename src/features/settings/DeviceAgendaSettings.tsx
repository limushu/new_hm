import Button from '../../components/Button';
import { useAction } from '../../components/useAction';
import { useDeviceAgenda } from '../../platform/DeviceAgendaProvider';
import { command } from '../../services/repository';
import { errorMessage } from '../../services/errors';
export default function DeviceAgendaSettings({
  enabled,
  onEnabled,
}: {
  enabled: boolean;
  onEnabled: (enabled: boolean) => Promise<void>;
}) {
  const { status, requestNotifications, refresh } = useDeviceAgenda();
  const { busy, error, run } = useAction();
  const notifications = status?.notifications;
  if (!notifications?.installed)
    return <p className="field-hint">系统提醒尚不可用，日程仍可在应用内查看。</p>;
  const granted = notifications.authorization === 'granted';
  return (
    <>
      <label className="setting-toggle">
        <span>
          日程系统通知<small>按日程设置的时间提醒。</small>
        </span>
        <input
          type="checkbox"
          aria-label="日程系统通知"
          checked={enabled && granted}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.checked;
            void run(async () => {
              if (next && !granted) await requestNotifications();
              await onEnabled(next);
              await refresh();
            });
          }}
        />
      </label>
      {!granted && (
        <p className="field-hint">
          {notifications.authorization === 'denied' || notifications.authorization === 'restricted'
            ? '通知权限未开启，日程仍会保留。请在系统设置中允许案笺通知。'
            : '首次启用时会申请通知权限。'}
        </p>
      )}
      <div className="feature-toolbar">
        {!granted && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  notifications.authorization === 'denied' ||
                  notifications.authorization === 'restricted'
                )
                  await command('agenda_notification_settings', {});
                else {
                  await requestNotifications();
                  await onEnabled(true);
                  await refresh();
                }
              })
            }
          >
            {notifications.authorization === 'denied' ||
            notifications.authorization === 'restricted'
              ? '打开系统设置'
              : '开启系统提醒'}
          </Button>
        )}
      </div>
      {granted && notifications.scheduled > 0 && (
        <p className="field-hint">已安排 {notifications.scheduled} 项系统提醒。</p>
      )}
      {notifications.deferred > 0 && (
        <p className="field-hint">
          还有 {notifications.deferred} 项提醒等待设备排程空间；继续使用应用时会补充安排。
        </p>
      )}
      {notifications.errorCode && (
        <p className="error-message" role="alert">
          {errorMessage({ code: notifications.errorCode })}
        </p>
      )}
      {status?.calendar.installed && (
        <p className="field-hint">
          可在已保存日程中选择“添加到系统日历”。当前关联 {status.calendar.linked}{' '}
          项，提醒仍由案笺统一处理。
        </p>
      )}
      {status?.calendar.errorCode && (
        <p className="error-message" role="alert">
          {errorMessage({ code: status.calendar.errorCode })}
        </p>
      )}
      {!!status?.calendar.failed && (
        <p className="error-message" role="alert">
          有 {status.calendar.failed} 项系统日历副本未能更新，请打开相应日程检查关联。
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
