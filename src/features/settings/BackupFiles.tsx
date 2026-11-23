import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import Button from '../../components/Button';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import { command } from '../../services/repository';
import type { BackupCandidate, BackupExport, SaveAction } from '../../domain/types';

/** The UI knows the backup use case, not its installed provider or platform. */
export default function BackupFiles({
  save,
  onRestored,
}: {
  save: SaveAction;
  onRestored: () => Promise<void>;
}) {
  const { busy, error, run } = useAction();
  const [candidate, setCandidate] = useState<BackupCandidate | null>(null);
  const [exported, setExported] = useState<BackupExport | null>(null);
  const [restored, setRestored] = useState(false);
  const pending = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current)
        void command('discard_backup_archive', { token: pending.current }).catch(() => {});
    };
  }, []);
  function close() {
    const token = pending.current;
    pending.current = null;
    setCandidate(null);
    if (token) void command('discard_backup_archive', { token }).catch(() => {});
  }
  return (
    <div className="backup-files">
      <div className="feature-toolbar">
        <Button
          variant="primary"
          icon={Download}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setExported(null);
              setRestored(false);
              const result = await command('export_backup_archive', {});
              if (mounted.current) setExported(result);
            })
          }
        >
          导出完整备份
        </Button>
        <Button
          icon={RotateCcw}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setExported(null);
              setRestored(false);
              const result = await command('pick_backup_archive', {});
              if (!mounted.current) {
                if (result) await command('discard_backup_archive', { token: result.token });
                return;
              }
              pending.current = result?.token ?? null;
              setCandidate(result);
            })
          }
        >
          从文件恢复
        </Button>
      </div>
      {busy && (
        <p className="field-hint" role="status">
          正在处理备份，请保持应用在前台…
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {exported && (
        <p className="backup-success" role="status">
          已导出 {exported.summary.caseCount} 个案件、{exported.summary.fileCount} 份文件。
          <span>{exported.name}</span>
        </p>
      )}
      {restored && (
        <p role="status" className="backup-success">
          备份已恢复，当前数据已更新。
        </p>
      )}
      <p className="field-hint">
        保存时可选择本机或系统文件选择器提供的云盘。云盘上传由系统完成；这是手动备份，不会自动同步多台设备。
      </p>
      {candidate && (
        <Dialog
          title="恢复完整备份"
          danger
          submitLabel="确认恢复"
          onClose={close}
          onSubmit={async () => {
            await save('restore_backup_archive', { token: candidate.token, confirmed: true });
            pending.current = null;
            setRestored(true);
            await onRestored();
          }}
        >
          <p className="feature-description">
            将当前工作区替换为 {new Date(candidate.summary.createdAt).toLocaleString('zh-CN')}{' '}
            的备份：{candidate.summary.caseCount} 个案件、{candidate.summary.fileCount} 份文件。
          </p>
          <p className="field-hint">
            当前数据会先保留一份本机恢复前副本。请先保存正在编辑的内容；本机设置保持不变。
          </p>
        </Dialog>
      )}
    </div>
  );
}
