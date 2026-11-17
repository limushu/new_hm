import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import Button from '../../components/Button';
import Dialog from '../../components/Dialog';
import { useTheme } from '../../components/ThemeProvider';
import { accentPresets, defaultAccent, validAccent } from '../../domain/accent';
import { useAction } from '../../components/useAction';
import './accent-picker.css';

export default function AccentPicker() {
  const { accent, setAccent } = useTheme();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(accent);
  const { busy, error, run } = useAction();
  return (
    <div className="accent-picker">
      <h3>强调色</h3>
      <div className="accent-options" role="group" aria-label="强调色">
        {accentPresets.map((item) => (
          <button
            key={item.color}
            type="button"
            disabled={busy}
            aria-pressed={accent === item.color}
            onClick={() => void run(() => setAccent(item.color))}
          >
            <span
              className="accent-dot"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            {item.name}
            {accent === item.color && <Check aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="accent-actions">
        <Button
          variant="ghost"
          icon={Palette}
          disabled={busy}
          onClick={() => {
            setDraft(accent);
            setCustom(true);
          }}
        >
          自选颜色
        </Button>
        {accent !== defaultAccent && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => setAccent(defaultAccent))}
          >
            恢复默认
          </Button>
        )}
      </div>
      <p className="field-hint">按钮、选中标记与链接统一使用此色系，并自动适配深浅主题。</p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {custom && (
        <Dialog
          title="自选强调色"
          submitLabel="应用颜色"
          onClose={() => setCustom(false)}
          onSubmit={async () => {
            if (!validAccent(draft)) throw new Error('请输入 #RRGGBB 格式的颜色代码');
            await setAccent(draft);
          }}
        >
          <label>
            选择颜色
            <input
              type="color"
              aria-label="选择强调色"
              value={validAccent(draft) ? draft : accent}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <label>
            颜色代码
            <input
              aria-label="强调色代码"
              value={draft}
              maxLength={7}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <p className="field-hint">应用后会生成适合当前背景、文字清晰的深浅色调。</p>
        </Dialog>
      )}
    </div>
  );
}
