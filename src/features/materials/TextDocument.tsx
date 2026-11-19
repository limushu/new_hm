import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import Dialog from '../../components/Dialog';
import VoiceTextArea from '../../components/VoiceTextArea';
import type { MaterialTarget, SaveAction } from '../../domain/types';

export default function TextDocument({
  target,
  save,
  onClose,
  properties,
}: {
  target: MaterialTarget;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
}) {
  const [name, setName] = useState(`文档 ${new Date().toLocaleDateString('sv-SE')}`);
  const [body, setBody] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [discard, setDiscard] = useState(false);
  const saved = useRef(false);
  return (
    <>
      <Dialog
        title="新建文档"
        submitLabel="保存文档"
        submitDisabled={voiceActive}
        className="text-document-dialog"
        onClose={() => ((body || voiceActive) && !saved.current ? setDiscard(true) : onClose())}
        onSubmit={async () => {
          const title = name.trim();
          if (!title || /[\\/:*?"<>|\u0000-\u001f]/.test(title))
            throw new Error('请填写有效的文档名称');
          if (!body.trim()) throw new Error('请先填写文档内容');
          if (new TextEncoder().encode(body).length > 2 * 1024 * 1024)
            throw new Error('文档内容不能超过 2 MB');
          await save('create_text_document', {
            target,
            name: /\.(md|txt)$/i.test(title) ? title : `${title}.md`,
            body,
          });
          saved.current = true;
        }}
      >
        <p className="field-hint">保存到本案材料中，可继续查找、阅读和导出。</p>
        <label>
          文档名称
          <input
            aria-label="文档名称"
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <VoiceTextArea
          label="正文"
          aria-label="文档正文"
          className="text-document-body"
          required
          rows={12}
          value={body}
          onValueChange={setBody}
          onVoiceActivity={setVoiceActive}
          placeholder="在这里撰写沟通纪要、办案思路或材料清单…"
        />
        <p className="field-hint">以本地 Markdown（.md）文本保存。保存前关闭可选择继续编辑。</p>
        {properties}
      </Dialog>
      {discard && (
        <Dialog
          title="放弃未保存的文档？"
          submitLabel="放弃文档"
          danger
          onClose={() => setDiscard(false)}
          onSubmit={async () => onClose()}
        >
          <p>这份文档尚未保存。关闭此提示可继续编辑。</p>
        </Dialog>
      )}
    </>
  );
}
