import { useEffect, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import Button from '../../components/Button';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import { useCloudSync } from '../../platform/SyncProvider';
import { freezeWorkspace, workspaceChanged } from '../../platform/syncActivity';
import { command } from '../../services/repository';
import { errorMessage } from '../../services/errors';
import type { CloudWorkspace } from '../../domain/sync';

const phases: Record<string, string> = {
  disabled: '尚未开启',
  pending: '等待同步',
  syncing: '正在同步…',
  incoming: '云端更新已下载，完成当前编辑后更新',
  synced: '已同步',
  conflict: '两台设备都有修改，需要你选择',
  error: '同步暂未完成',
};
export default function SyncSettings() {
  const { status, refresh } = useCloudSync();
  const { busy, error, run } = useAction();
  const [dialog, setDialog] = useState<'enable' | 'conflict' | null>(null);
  const [workspaces, setWorkspaces] = useState<CloudWorkspace[]>([]);
  const [selected, setSelected] = useState('');
  const [choice, setChoice] = useState<'local' | 'remote'>('local');
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  return (
    <section className="settings-section" aria-label="iCloud 同步">
      <h2>
        <Cloud /> iCloud 同步
      </h2>
      <p className="feature-description">
        开启后，在使用相同案笺账号和 iCloud 账号的 iPhone、iPad
        之间同步整个工作区，包括案件、人员、日程、收支、材料和录音。
      </p>
      {!status && <p className="field-hint">正在读取同步状态…</p>}
      {status && !status.installed && (
        <p className="field-hint">此平台暂未接入 iCloud 同步，可继续使用本机数据和文件备份。</p>
      )}
      {status?.installed && !status.configured && (
        <p className="field-hint">此安装版本尚未配置 iCloud 权限，请更新到支持同步的版本。</p>
      )}
      {status?.configured && (
        <>
          <p role="status" className="field-hint">
            {phases[status.phase] ?? '等待同步'}
            {status.workspaceLabel ? ` · ${status.workspaceLabel}` : ''}
          </p>
          {status.lastSuccessAt && (
            <p className="field-hint">
              最近完成：{new Date(status.lastSuccessAt).toLocaleString('zh-CN')}
            </p>
          )}
          {status.errorCode && (
            <p role="alert" className="error-message">
              {errorMessage({ code: status.errorCode })}
            </p>
          )}
          <div className="feature-toolbar">
            {status.enabled ? (
              <>
                <Button
                  icon={RefreshCw}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await command('sync_tick', {});
                      await refresh();
                      window.dispatchEvent(new Event(workspaceChanged));
                    })
                  }
                >
                  立即同步
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await command('sync_disable', {});
                      await refresh();
                    })
                  }
                >
                  暂停同步
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setWorkspaces([]);
                  setSelected('');
                  setDialog('enable');
                }}
              >
                开启 iCloud 同步
              </Button>
            )}
            {status.conflict && (
              <Button variant="primary" onClick={() => setDialog('conflict')}>
                处理版本差异
              </Button>
            )}
          </div>
          <p className="field-hint">
            请先登录案笺账号。使用应用时自动同步；离线修改会保留在本机，联网并返回应用后重试。锁屏和后台不保证实时同步。
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {dialog === 'enable' && (
        <Dialog
          title="开启 iCloud 同步"
          onClose={() => setDialog(null)}
          submitLabel={workspaces.length ? '开启同步' : '继续'}
          onSubmit={async () => {
            if (!workspaces.length) {
              const available = await command('sync_workspaces', {});
              if (available.length === 1) {
                await command('sync_enable', { workspaceId: available[0].id });
                await refresh();
                window.dispatchEvent(new Event(workspaceChanged));
                return;
              }
              setWorkspaces(available);
              setSelected(available[0]?.id ?? '');
              return false;
            }
            await command('sync_enable', { workspaceId: selected });
            await refresh();
            window.dispatchEvent(new Event(workspaceChanged));
          }}
        >
          <p className="feature-description">
            案件内容将保存到你自己的 iCloud 私有空间。案笺账号服务只保存工作区目录和绑定信息。
          </p>
          <p className="field-hint">
            首次同步若发现本机与云端都有不同内容，会先让你选择；不会自动合并或覆盖。暂停同步会保留本机和云端数据。请保持应用在前台完成首次同步。
          </p>
          {workspaces.length > 1 && (
            <label>
              选择已有工作区
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Dialog>
      )}
      {dialog === 'conflict' && status?.conflict && (
        <Dialog
          title="选择本次使用的版本"
          onClose={() => setDialog(null)}
          submitLabel="确认使用"
          onSubmit={async () => {
            const token = status.conflict!.token;
            const thaw = freezeWorkspace(document);
            try {
              await command('sync_resolve', { token, useLocal: choice === 'local' });
              // The whole workspace may have changed; reload only after native success.
              location.reload();
            } finally {
              thaw();
            }
          }}
        >
          <p className="feature-description">
            双方版本会先保留，再采用你选择的版本继续同步。当前不自动合并不同设备的修改。
          </p>
          {(['local', 'remote'] as const).map((value) => {
            const info = status.conflict![value];
            return (
              <label className="setting-toggle" key={value}>
                <span>
                  {value === 'local' ? '使用这台设备的版本' : '使用云端版本'}
                  <small>
                    {info.caseCount} 个案件 · {info.fileCount} 份文件 ·{' '}
                    {new Date(info.createdAt).toLocaleString('zh-CN')}
                  </small>
                </span>
                <input
                  type="radio"
                  name="sync-resolution"
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
              </label>
            );
          })}
        </Dialog>
      )}
    </section>
  );
}
