import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Download, FolderOpen, RotateCcw, Check } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import type { BackupInfo, Commands, SaveAction } from '../../domain/types';
import { command, desktopRuntime } from '../../services/repository';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import metadata from '../../../package.json';
export default function Settings({
  save,
  storage,
}: {
  save: SaveAction;
  storage: Commands['storage_info']['result'] | null;
}) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(false);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [update, setUpdate] = useState<Commands['check_update']['result']>(null);
  const [updateDialog, setUpdateDialog] = useState(false);
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    let canceled = false;
    void Promise.all([
      command('get_settings', {}),
      command('background_status', {}),
      command('autostart_status', {}),
    ])
      .then(([settings, health, auto]) => {
        if (!canceled) {
          setSettings(settings);
          setHealth(health);
          setAuto(auto);
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    if (!desktopRuntime) return;
    let canceled = false;
    const stops: Array<() => void> = [];
    void Promise.all([
      listen<Record<string, string>>('background-status', (e) => setHealth(e.payload)),
      listen<{ downloaded: number; total: number | null }>('update-progress', (e) =>
        setProgress(
          e.payload.total
            ? `${Math.round((e.payload.downloaded / e.payload.total) * 100)}%`
            : `${Math.round(e.payload.downloaded / 1024)} KB`,
        ),
      ),
    ]).then((values) => {
      if (canceled) values.forEach((stop) => stop());
      else stops.push(...values);
    });
    return () => {
      canceled = true;
      stops.forEach((stop) => stop());
    };
  }, []);
  async function setting(key: string, value: string) {
    await run(async () => {
      await command('set_setting', { key, value });
      setSettings((s) => ({ ...s, [key]: value }));
    });
  }
  return (
    <div className="simple-page settings-page">
      <h1>
        <SettingsIcon />
        设置
      </h1>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <section className="settings-section">
        <h2>本地数据</h2>
        {settings.recovery_notice && (
          <p role="status" className="field-hint">
            {settings.recovery_notice}
          </p>
        )}
        <p className="feature-description">
          案件、材料和录音保存在这台电脑，无需登录。
          {storage?.portable ? '当前为历史绿色模式。' : '安装及软件升级不会清除这些数据。'}
        </p>
        <div className="storage-path">
          <span>数据目录</span>
          <code>{storage?.dataDirectory ?? '正在读取…'}</code>
        </div>
      </section>
      <section className="settings-section">
        <h2>备份与恢复</h2>
        <p className="feature-description">
          每天使用时自动备份一次，保留最近 7 份，包含案件、材料和录音。可把位置选在另一块磁盘。
        </p>
        <div className="settings-path">
          <code>{settings.backup_directory ?? '请在桌面应用中选择备份位置'}</code>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const path = await command('choose_backup_directory', {});
                if (path) setSettings((s) => ({ ...s, backup_directory: path }));
              })
            }
          >
            <FolderOpen />
            选择位置
          </button>
        </div>
        <p className="field-hint">
          最近自动备份：{settings.last_backup_date ?? health.lastBackup ?? '尚未完成'}
        </p>
        {health.backupError && (
          <p role="alert" className="error-message">
            自动备份未完成：{health.backupError}
          </p>
        )}
        {backup && (
          <p role="status" className="backup-success">
            <Check />
            已备份 {backup.caseCount} 个案件、{backup.fileCount} 份文件。
            <span>{backup.directory}</span>
          </p>
        )}
        <div className="feature-toolbar">
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const info = await command('run_backup', {});
                setBackup(info);
                setHealth((h) => {
                  const next = { ...h };
                  delete next.backupError;
                  return next;
                });
                setSettings((s) => ({
                  ...s,
                  last_backup_date: new Date().toLocaleDateString('sv-SE'),
                }));
              })
            }
          >
            <Download />
            {busy ? '处理中…' : '立即备份'}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => setRestore(await command('pick_restore_backup', {})))
            }
          >
            <RotateCcw />
            恢复备份
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>提醒与后台运行</h2>
        <label className="setting-toggle">
          <span>
            日程系统通知<small>只提醒已设置提醒时间的日程。</small>
          </span>
          <input
            type="checkbox"
            aria-label="日程系统通知"
            checked={settings.notifications !== 'false'}
            disabled={busy}
            onChange={(e) => void setting('notifications', String(e.target.checked))}
          />
        </label>
        <label className="setting-toggle">
          <span>
            关闭窗口后留在托盘<small>后台继续提醒；从托盘菜单退出后停止提醒。</small>
          </span>
          <input
            type="checkbox"
            aria-label="关闭窗口后留在托盘"
            checked={settings.close_to_tray !== 'false'}
            disabled={busy}
            onChange={(e) => void setting('close_to_tray', String(e.target.checked))}
          />
        </label>
        <label className="setting-toggle">
          <span>登录 Windows 时启动</span>
          <input
            type="checkbox"
            aria-label="开机启动"
            checked={auto}
            disabled={busy}
            onChange={(e) => {
              const enabled = e.target.checked;
              void run(async () => {
                await command('set_autostart', { enabled });
                setAuto(enabled);
              });
            }}
          />
        </label>
        {health.notificationError && (
          <p role="alert" className="error-message">
            系统通知暂不可用，请检查 Windows 通知权限。{health.notificationError}
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>版本与更新</h2>
        <p className="feature-description">律师工作台 {metadata.version} · Windows 安装版</p>
        <p className="field-hint">
          检查新版本后，由你确认下载和安装。升级包会验证签名，安装前会备份当前工作区。
        </p>
        <div className="feature-toolbar">
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await command('check_update', {});
                setUpdate(result);
                setChecked(true);
              })
            }
          >
            <Download />
            {busy ? '正在处理…' : '检查更新'}
          </button>
          {update ? (
            <button className="primary-action" onClick={() => setUpdateDialog(true)}>
              更新到 {update.version}
            </button>
          ) : (
            checked && <span className="field-hint">当前已是最新版本。</span>
          )}
        </div>
        {progress && (
          <p role="status" className="field-hint">
            下载进度 {progress}
          </p>
        )}
      </section>
      {restore && (
        <Dialog
          title="恢复工作区备份"
          onClose={() => setRestore(null)}
          submitLabel="确认恢复"
          danger
          onSubmit={async () => {
            await save('apply_restore_backup', { path: restore.directory, confirmed: true });
            setSettings(await command('get_settings', {}));
            setBackup(null);
          }}
        >
          <p className="feature-description">
            将当前工作区替换为 {new Date(restore.createdAt).toLocaleString('zh-CN')} 的备份：
            {restore.caseCount} 个案件、{restore.fileCount} 份文件。
          </p>
          <p className="field-hint">
            当前数据会先保留一份恢复前副本。请先关闭正在编辑归档材料的其他软件。
          </p>
        </Dialog>
      )}
      {updateDialog && update && (
        <Dialog
          title={`安装 ${update.version}`}
          onClose={() => setUpdateDialog(false)}
          submitLabel="下载并安装"
          onSubmit={async () => {
            await command('install_update', { confirmed: true });
          }}
        >
          <p className="feature-description">安装时应用将退出并重启，案件数据保留。</p>
          {update.notes && <p className="update-notes">{update.notes}</p>}
          {progress && (
            <p role="status" className="field-hint">
              下载进度 {progress}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
