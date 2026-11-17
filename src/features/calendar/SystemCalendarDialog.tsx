import { useEffect, useState } from 'react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import Button from '../../components/Button';
import { command } from '../../services/repository';
import { useDeviceAgenda } from '../../platform/DeviceAgendaProvider';
import type { CalendarLink, CalendarTarget } from '../../domain/agenda';
export default function SystemCalendarDialog({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<CalendarTarget[]>([]);
  const [selected, setSelected] = useState('');
  const [link, setLink] = useState<CalendarLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { refresh } = useDeviceAgenda();
  async function load(active: () => boolean = () => true) {
    setLoading(true);
    setError('');
    try {
      const existing = await command('agenda_calendar_link', { eventId });
      if (!active()) return;
      setLink(existing);
      const choices = await command('agenda_calendar_targets', {});
      if (!active()) return;
      setTargets(choices);
      setSelected(existing?.targetId ?? choices[0]?.id ?? '');
    } catch (error) {
      if (active()) setError(String(error));
    } finally {
      if (active()) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load(() => active);
    });
    return () => {
      active = false;
    };
  }, [eventId]);
  return (
    <Dialog
      title={link ? '系统日历关联' : '添加到系统日历'}
      submitDisabled={loading || !selected}
      onClose={onClose}
      submitLabel={link ? '更新系统副本' : '添加日程'}
      onSubmit={async () => {
        if (loading || !selected) return false;
        await command('agenda_calendar_attach', { eventId, targetId: selected });
        await refresh();
      }}
      secondaryAction={
        link
          ? {
              label: '取消关联并保留副本',
              run: async () => {
                await command('agenda_calendar_detach', { eventId });
                await refresh();
              },
            }
          : undefined
      }
    >
      <p className="feature-description">
        选择一个系统日历保存此日程。后续在案笺改期或删除时，会更新这个副本；系统日历中的修改暂不回传案笺。
      </p>
      <p className="field-hint">
        首次使用需要日历读写授权，用于维护你选择的副本。不会导入其他个人日历；副本不额外添加提醒，避免与案笺通知重复。
      </p>
      {loading ? (
        <p role="status" className="field-hint">
          正在读取可写日历…
        </p>
      ) : targets.length ? (
        <label>
          保存到
          <Select
            aria-label="系统日历"
            value={selected}
            disabled={!!link}
            onValueChange={(value) => setSelected(String(value))}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="field-hint">暂时没有可写日历，请先检查系统日历账号或授权。</p>
      )}
      {link && (
        <p className="field-hint">已关联：{link.targetTitle}。取消关联会保留系统日历中的副本。</p>
      )}
      {error && (
        <>
          <p className="error-message" role="alert">
            {error}
          </p>
          <Button disabled={loading} onClick={() => void load()}>
            重试读取日历
          </Button>
        </>
      )}
    </Dialog>
  );
}
