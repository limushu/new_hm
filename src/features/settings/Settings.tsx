import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Download, FolderOpen, RotateCcw, Check } from 'lucide-react';
import { watchMaintenance } from '../../platform/maintenance';
import { watchUpdates } from '../../platform/updates';
import type { BackupInfo, Commands, SaveAction } from '../../domain/types';
import { command, nativeRuntime } from '../../services/repository';
import Dialog from '../../components/Dialog';
import UpdateDialog from '../../components/UpdateDialog';
import Welcome from '../../components/Welcome';
import { useAction } from '../../components/useAction';
import metadata from '../../../package.json';
import { useTheme } from '../../components/ThemeProvider';
import { useSubsystems } from '../../platform/SubsystemProvider';
import { supports } from '../../platform/subsystems';
export default function Settings({
  save,
  storage,
}: {
  save: SaveAction;
  storage: Commands['storage_info']['result'] | null;
}) {
  const { manifest, error: subsystemError } = useSubsystems();
  const tray = supports(manifest, 'tray');
  const autostart = supports(manifest, 'autostart');
  const updates = supports(manifest, 'signed-updates');
  const maintenance =
    supports(manifest, 'background-maintenance') || supports(manifest, 'foreground-maintenance');
  const localBackup = supports(manifest, 'local-backup');
  const backupTransfer = supports(manifest, 'backup-transfer');
  const systemNotifications = supports(manifest, 'system-notifications');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(false);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [update, setUpdate] = useState<Commands['check_update']['result']>(null);
  const [updateDialog, setUpdateDialog] = useState(false);
  const [checked, setChecked] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const { busy, error, run } = useAction();
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    let canceled = false;
    void Promise.all([
      command('get_settings', {}),
      maintenance ? command('background_status', {}).catch(() => ({})) : Promise.resolve({}),
      autostart ? command('autostart_status', {}).catch(() => false) : Promise.resolve(false),
      updates ? command('get_update_status', {}).catch(() => null) : Promise.resolve(null),
    ])
      .then(([settings, health, auto, available]) => {
        if (!canceled) {
          setSettings(settings);
          setHealth(health);
          setAuto(auto);
          setEndpoint(settings.update_endpoint ?? '');
          setUpdate(available);
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [maintenance, autostart, updates]);
  useEffect(() => {
    if (!nativeRuntime) return;
    let canceled = false;
    const stops: Array<() => void> = [];
    const subscriptions = [];
    if (maintenance)
      subscriptions.push(
        watchMaintenance((health) => {
          if (!canceled) setHealth(health);
        }),
      );
    if (updates)
      subscriptions.push(
        watchUpdates((info) => {
          if (!canceled) {
            setUpdate(info);
            setChecked(false);
          }
        }),
      );
    for (const subscription of subscriptions)
      void subscription
        .then((stop) => {
          if (canceled) stop();
          else stops.push(stop);
        })
        .catch(() => {});
    return () => {
      canceled = true;
      stops.forEach((stop) => stop());
    };
  }, [maintenance, updates]);
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
      {(error || subsystemError) && (
        <p className="error-message" role="alert">
          {error || subsystemError}
        </p>
      )}
      <section className="settings-section">
        <h2>外观</h2>
        <div className="theme-options" aria-label="外观主题">
          {(
            [
              ['light', '浅色'],
              ['dark', '深色'],
              ['system', '跟随系统'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={theme === value}
              disabled={busy}
              onClick={() => void run(() => setTheme(value))}
            >
              <span className={`theme-swatch ${value}`} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="feature-toolbar">
          <button onClick={() => setWelcome(true)}>
            <RotateCcw />
            重播欢迎动画
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>本地数据</h2>
        {settings.recovery_notice && (
          <p role="status" className="field-hint">
            {settings.recovery_notice}
          </p>
        )}
        <p className="feature-description">
          案件、材料和录音保存在这台设备，无需登录。
          {storage?.portable
            ? '当前为历史绿色模式。'
            : backupTransfer
              ? '安装及软件升级不会清除这些数据。'
              : '卸载应用会移除本机数据。'}
        </p>
        <div className="storage-path">
          <span>数据目录</span>
          <code>{storage?.dataDirectory ?? '正在读取…'}</code>
        </div>
      </section>
      <section className="settings-section">
        <h2>备份与恢复</h2>
        <p className="feature-description">
          {backupTransfer
            ? '每天使用时自动备份一次，保留最近 7 份，包含案件、材料和录音。可把位置选在另一块磁盘。'
            : '使用时检查当天备份，保留最近 7 份。本机副本不能防止设备丢失；当前版本尚不支持向设备外导出备份。'}
        </p>
        <div className="settings-path">
          <code>{settings.backup_directory ?? '正在读取备份位置…'}</code>
          {backupTransfer && (
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
          )}
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
            disabled={busy || !localBackup}
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
          {backupTransfer && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setRestore(await command('pick_restore_backup', {})))
              }
            >
              <RotateCcw />
              恢复备份
            </button>
          )}
        </div>
        {health.maintenanceError && (
          <p className="error-message" role="alert">
            维护未完成：{health.maintenanceError}
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>提醒与后台运行</h2>
        {systemNotifications ? (
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
        ) : (
          <p className="field-hint">系统提醒尚不可用，日程仍可在应用内查看。</p>
        )}
        {tray && (
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
        )}
        {autostart && (
          <label className="setting-toggle">
            <span>登录系统时启动</span>
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
        )}
        {health.notificationError && (
          <p role="alert" className="error-message">
            系统通知暂不可用，请检查系统通知权限。{health.notificationError}
          </p>
        )}
      </section>
      <section className="settings-section" id="version-update-section">
        <h2>{updates ? '版本与更新' : '版本'}</h2>
        <p className="feature-description">案笺 {metadata.version}</p>
        {updates && (
          <>
            <p className="field-hint">
              启动 15 秒后及每 6
              小时在后台检查，有新版时提示。点击提示可直接查看并确认安装，无需进入设置；安装前会备份工作区并验证升级包签名。
            </p>
            <form
              className="update-source-form"
              onSubmit={(e) => {
                e.preventDefault();
                void setting('update_endpoint', endpoint.trim());
                setChecked(false);
              }}
            >
              <label>
                优先更新源（可选）
                <input
                  type="url"
                  aria-label="优先更新源"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://你的下载站/latest.json"
                  pattern="https://.*"
                />
              </label>
              <button type="submit" disabled={busy}>
                保存更新源
              </button>
            </form>
            <p className="field-hint">
              留空使用 GitHub。可填写 GitLab 或自有下载站的更新清单 HTTPS 地址；优先源不可用时尝试
              GitHub。安装包也需上传到该下载站，不能只复制清单链接。无法连接不影响离线使用。
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
          </>
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
      {updates && updateDialog && update && (
        <UpdateDialog update={update} onClose={() => setUpdateDialog(false)} />
      )}
      {welcome && <Welcome onDone={() => setWelcome(false)} />}
    </div>
  );
}
