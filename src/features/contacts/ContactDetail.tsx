import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Network, Link2, FileText, Pencil, Trash2 } from 'lucide-react';
import DeleteContact from './DeleteContact';
import Dialog from '../../components/Dialog';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { proceedingName } from '../../domain/proceedings';
import { linkedCases, relatedContacts } from '../../domain/relations';
import { contactLabels } from './ContactPicker';
import ContactForm from './ContactForm';
import RelationGraph from './RelationGraph';
export default function ContactDetail({
  contact,
  data,
  save,
  onClose,
  onCase,
  initialView = 'details',
}: {
  contact: Contact;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onCase: (id: string) => void;
  initialView?: 'details' | 'links' | 'graph';
}) {
  const [selected, setSelected] = useState(contact.id);
  const [history, setHistory] = useState<string[]>([]);
  const [view, setView] = useState<'details' | 'links' | 'graph'>(initialView);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const current = data.contacts.find((c) => c.id === selected) ?? contact;
  const cases = linkedCases(data, current.id);
  const related = relatedContacts(data, current);
  function go(id: string) {
    if (id === selected) return;
    setHistory((h) => [...h, selected]);
    setSelected(id);
    setView('details');
  }
  return (
    <Dialog
      title={current.name}
      onClose={onClose}
      className={`contact-detail-dialog ${view === 'details' ? 'is-details' : ''}`}
    >
      <div className="entity-context">
        <span>{contactLabels[current.kind]}</span>
        <span>{cases.length} 个关联案件</span>
        <button type="button" onClick={() => setEdit(true)}>
          <Pencil />
          编辑对象
        </button>
        <button type="button" className="entity-delete" onClick={() => setRemove(true)}>
          <Trash2 />
          删除对象
        </button>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelected(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            <ArrowLeft />
            返回上个对象
          </button>
        )}
      </div>
      <nav className="entity-view-tabs">
        <button
          type="button"
          className={view === 'details' ? 'active' : ''}
          onClick={() => setView('details')}
        >
          <FileText />
          详情
        </button>
        <button
          type="button"
          className={view === 'links' ? 'active' : ''}
          onClick={() => setView('links')}
        >
          <Link2 />
          反向关联
        </button>
        <button
          type="button"
          className={view === 'graph' ? 'active' : ''}
          onClick={() => setView('graph')}
        >
          <Network />
          局部关系图
        </button>
      </nav>
      {view === 'details' ? (
        <section className="entity-details" aria-label="对象资料">
          <dl>
            <div>
              <dt>对象名称</dt>
              <dd>{current.name}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{contactLabels[current.kind]}</dd>
            </div>
            <div>
              <dt>电话</dt>
              <dd className={!current.phone ? 'is-empty' : ''}>{current.phone || '未填写'}</dd>
            </div>
            <div>
              <dt>地址</dt>
              <dd className={!current.address ? 'is-empty' : ''}>{current.address || '未填写'}</dd>
            </div>
          </dl>
          <h3>备注</h3>
          <p className={`contact-notes ${!current.notes ? 'is-empty' : ''}`}>
            {current.notes || '暂无备注'}
          </p>
          {related.length > 0 && (
            <div className="entity-detail-affiliations">
              <span>{current.kind === 'judge' ? '所属法院' : '法官'}</span>
              {related.map((c) => (
                <button type="button" key={c.id} onClick={() => go(c.id)}>
                  {c.name}
                  <ArrowUpRight />
                </button>
              ))}
            </div>
          )}
          <button type="button" className="entity-related-entry" onClick={() => setView('links')}>
            <Link2 />
            查看关联案件 <span>{cases.length}</span>
            <ArrowUpRight />
          </button>
        </section>
      ) : view === 'graph' ? (
        <RelationGraph
          key={selected}
          data={data}
          focusId={`contact:${selected}`}
          onContact={go}
          onCase={(id) => {
            onClose();
            onCase(id);
          }}
        />
      ) : (
        <div
          className={`entity-links-layout ${['court', 'judge'].includes(current.kind) ? '' : 'single-column'}`}
        >
          <section>
            <h3>
              关联案件 <span>{cases.length}</span>
            </h3>
            {!cases.length && <p className="quiet-empty">关联案件后会自动出现在这里。</p>}
            {cases.map((c) => (
              <button
                type="button"
                className="backlink-row contact-case-link"
                key={c.id}
                onClick={() => {
                  onClose();
                  onCase(c.id);
                }}
              >
                <span>
                  {c.title}
                  <small>
                    {[
                      ...new Set([
                        ...data.caseParties
                          .filter((p) => p.caseId === c.id && p.contactId === current.id)
                          .map(
                            (p) =>
                              ({
                                client: '我方委托人',
                                opponent: '对方当事人',
                                other: '其他当事人',
                              })[p.side],
                          ),
                        ...data.contactLinks
                          .filter((l) => l.caseId === c.id && l.contactId === current.id)
                          .map(
                            (l) =>
                              `${l.proceedingId ? proceedingName(data.proceedings.find((p) => p.id === l.proceedingId)!, data.proceedings) + ' · ' : ''}${l.role}`,
                          ),
                        ...data.proceedingPartyRoles
                          .filter((r) =>
                            data.caseParties.some(
                              (p) =>
                                p.id === r.partyId &&
                                p.caseId === c.id &&
                                p.contactId === current.id,
                            ),
                          )
                          .map(
                            (r) =>
                              `${proceedingName(data.proceedings.find((p) => p.id === r.proceedingId)!, data.proceedings)} · ${r.role}`,
                          ),
                      ]),
                    ].join(' / ')}
                  </small>
                </span>
                <ArrowUpRight />
              </button>
            ))}
          </section>
          {['court', 'judge'].includes(current.kind) && (
            <section>
              <h3>
                {current.kind === 'court' ? '关联法官' : '关联法院'} <span>{related.length}</span>
              </h3>
              {!related.length && (
                <p className="quiet-empty">
                  {current.kind === 'judge'
                    ? '编辑对象可添加法院关系。'
                    : current.kind === 'court'
                      ? '选择该法院办理的法官后自动形成关联。'
                      : '法院、法官和案件身份会按关系呈现。'}
                </p>
              )}
              {related.map((c) => (
                <button type="button" key={c.id} className="backlink-row" onClick={() => go(c.id)}>
                  <span>
                    {c.name}
                    <small>
                      {contactLabels[c.kind]}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </small>
                  </span>
                  <ArrowUpRight />
                </button>
              ))}
            </section>
          )}
        </div>
      )}
      {edit && (
        <ContactForm
          key={current.id}
          value={current}
          data={data}
          save={save}
          onClose={() => setEdit(false)}
        />
      )}
      {remove && (
        <DeleteContact
          contact={current}
          data={data}
          save={save}
          onClose={() => setRemove(false)}
          onDeleted={onClose}
        />
      )}
    </Dialog>
  );
}
