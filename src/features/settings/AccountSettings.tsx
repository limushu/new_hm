import { useEffect, useState } from 'react';
import { RefreshCw, UserRound } from 'lucide-react';
import Button from '../../components/Button';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import { command } from '../../services/repository';
import type { IdentityProvider, IdentitySnapshot } from '../../domain/identity';
import './account-settings.css';

const names: Record<IdentityProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  azure: 'Microsoft',
};
export default function AccountSettings() {
  const [snapshot, setSnapshot] = useState<IdentitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<
    { action: 'link' | 'unlink'; provider: IdentityProvider } | 'delete' | null
  >(null);
  const { busy, error, setError, run } = useAction();
  useEffect(() => {
    let active = true;
    // Defer dispatch so StrictMode's disposed first effect cannot occupy the
    // native operation gate and discard the only successful status response.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const state = await command('identity_status', {});
        if (active) setSnapshot(state);
      } catch (error) {
        if (active) setError(String(error));
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  function clearAccount() {
    setSnapshot((current) => (current ? { ...current, account: null } : current));
  }
  const account = snapshot?.account;
  return (
    <section className="settings-section account-settings" aria-label="案笺账号">
      <h2>
        <UserRound />
        案笺账号
      </h2>
      <p className="feature-description">
        无需登录也能使用本机案件。登录用于统一身份，自动跨设备同步尚未开放。
      </p>
      {loading && (
        <p className="field-hint" role="status">
          正在读取账号状态…
        </p>
      )}
      {account && (
        <div className="account-summary">
          <strong>{account.name || account.email || '案笺账号'}</strong>
          {account.name && account.email && <span>{account.email}</span>}
          <small>已登录 · 本机案件仍保存在此设备</small>
        </div>
      )}
      {snapshot && !snapshot.installed && (
        <p className="field-hint">此平台的安全登录驱动尚未接入，可继续离线使用。</p>
      )}
      {snapshot?.installed && (
        <>
          {!snapshot.providers.some((item) => item.enabled) && (
            <p className="field-hint">账号服务已连接，登录方式正在配置中。</p>
          )}
          <div className="account-providers">
            {snapshot.providers.map(({ provider, enabled }) => {
              const linked = account?.providers.includes(provider);
              return (
                <div className="account-provider" key={provider}>
                  <span>
                    {names[provider]}
                    <small>
                      {linked
                        ? '已绑定'
                        : enabled
                          ? account
                            ? '未绑定'
                            : '可用于登录'
                          : '等待配置'}
                    </small>
                  </span>
                  {account ? (
                    <Button
                      disabled={
                        busy || (!linked && !enabled) || (linked && account.providers.length <= 1)
                      }
                      onClick={() => setConfirm({ action: linked ? 'unlink' : 'link', provider })}
                    >
                      {linked ? '解绑' : '绑定'}
                    </Button>
                  ) : (
                    <Button
                      disabled={busy || !enabled}
                      onClick={() =>
                        void run(async () => {
                          setNotice('');
                          setSnapshot(await command('identity_sign_in', { provider }));
                        })
                      }
                    >
                      使用 {names[provider]} 登录
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {!account && <p className="field-hint">首次登录会创建案笺账号，不会自动上传本机案件。</p>}
          {account && (
            <p className="field-hint">至少保留一种登录方式；其他身份通过“绑定”加入当前账号。</p>
          )}
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="field-hint" role="status">
          {notice}
        </p>
      )}
      <div className="feature-toolbar">
        <Button
          disabled={busy || loading}
          icon={RefreshCw}
          onClick={() => void run(async () => setSnapshot(await command('identity_status', {})))}
        >
          刷新状态
        </Button>
        {(account || (error && snapshot?.installed !== false)) && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await command('identity_sign_out', {});
                clearAccount();
                setNotice('已清除本机登录，本地案件保留。');
              })
            }
          >
            {account ? '退出登录' : '清除本机登录'}
          </Button>
        )}
        {account && (
          <Button disabled={busy} variant="ghost" onClick={() => setConfirm('delete')}>
            删除账号
          </Button>
        )}
      </div>
      {confirm && (
        <Dialog
          title={
            confirm === 'delete'
              ? '删除案笺账号'
              : `${confirm.action === 'link' ? '绑定' : '解绑'} ${names[confirm.provider]}`
          }
          onClose={() => setConfirm(null)}
          danger={confirm === 'delete'}
          submitLabel={
            confirm === 'delete'
              ? '确认删除账号'
              : confirm.action === 'link'
                ? '继续绑定'
                : '确认解绑'
          }
          onSubmit={async () => {
            if (confirm === 'delete') {
              await command('identity_delete_account', { confirmed: true });
              clearAccount();
              setNotice('案笺账号及服务端目录已删除。本机案件、已导出的备份和外部云文件保留。');
            } else {
              setSnapshot(
                await command(confirm.action === 'link' ? 'identity_link' : 'identity_unlink', {
                  provider: confirm.provider,
                }),
              );
            }
          }}
        >
          {confirm === 'delete' ? (
            <>
              <p>此操作会永久删除案笺账号、账号资料、云绑定和工作区目录，无法撤销。</p>
              <p>本机案件、材料、录音、已导出的备份及外部云文件不会删除，请分别管理这些内容。</p>
              {account?.providers.includes('apple') && (
                <p>
                  绑定了 Apple 的账号可能需要重新授权，以撤销 Apple
                  登录权限；未能完成撤销时不会删除账号。
                </p>
              )}
            </>
          ) : (
            <p>
              {confirm.action === 'link'
                ? `将所选 ${names[confirm.provider]} 身份绑定到当前案笺账号。请在系统授权窗口确认使用的账号。`
                : `解绑后，这个 ${names[confirm.provider]} 身份不能再登录当前案笺账号。其他登录方式和本机案件保留。`}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
