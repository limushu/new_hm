import { useRef, useState } from 'react';
import Dialog from '../../components/Dialog';
import type { MaterialTarget, SaveAction } from '../../domain/types';

export default function TextDocument({
  target,
  save,
  onClose,
}: {
  target: MaterialTarget;
  save: SaveAction;
  onClose: () => void;
}) {
  const [name, setName] = useState(`文档 ${new Date().toLocaleDateString('sv-SE')}`);
  const [body, setBody] = useState('');
  const [discard, setDiscard] = useState(false);
  const saved = useRef(false);
  return (
    <>
      <Dialog
        title="新建文档"
        submitLabel="保存文档"
        className="text-document-dialog"
        onClose={() => (body && !saved.current ? setDiscard(true) : onClose())}
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
        <label>
          正文
          <textarea
            aria-label="文档正文"
            className="text-document-body"
            required
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="在这里撰写沟通纪要、办案思路或材料清单…"
          />
        </label>
        <p className="field-hint">以本地 Markdown（.md）文本保存。保存前关闭可选择继续编辑。</p>
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
