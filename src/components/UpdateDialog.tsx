import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { Commands } from '../domain/types';
import { command, desktopRuntime } from '../services/repository';
import Dialog from './Dialog';

export default function UpdateDialog({
  update,
  onClose,
}: {
  update: NonNullable<Commands['get_update_status']['result']>;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState('');
  useEffect(() => {
    if (!desktopRuntime) return;
    let canceled = false;
    let stop: (() => void) | undefined;
    void listen<{ downloaded: number; total: number | null }>('update-progress', ({ payload }) => {
      if (!canceled)
        setProgress(
          payload.total
            ? `${Math.min(100, Math.round((payload.downloaded / payload.total) * 100))}%`
            : `${Math.round(payload.downloaded / 1024)} KB`,
        );
    })
      .then((unlisten) => {
        if (canceled) unlisten();
        else stop = unlisten;
      })
      .catch(() => {});
    return () => {
      canceled = true;
      stop?.();
    };
  }, []);
  return (
    <Dialog
      title={`安装 ${update.version}`}
      onClose={onClose}
      submitLabel="下载并安装"
      onSubmit={async () => {
        await command('install_update', { confirmed: true });
      }}
    >
      <p className="feature-description">
        安装前会自动备份工作区并验证升级包签名，安装时应用将退出并重启。
      </p>
      {update.notes && <p className="update-notes">{update.notes}</p>}
      {progress && (
        <p role="status" className="field-hint">
          下载进度 {progress}
        </p>
      )}
    </Dialog>
  );
}
