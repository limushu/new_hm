import Dialog from '../../components/Dialog';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { relatedContacts } from '../../domain/relations';
export default function DeleteContact({
  contact,
  data,
  save,
  onClose,
  onDeleted,
}: {
  contact: Contact;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  return (
    <Dialog
      title="删除联系对象"
      onClose={onClose}
      danger
      submitLabel="删除"
      onSubmit={async () => {
        await save('delete_contact', { id: contact.id });
        onDeleted?.();
      }}
    >
      <p className="feature-description">删除“{contact.name}”？此操作不可撤销。</p>
      <p className="feature-description">
        将自动解除 {data.contactLinks.filter((l) => l.contactId === contact.id).length} 条案件关联和{' '}
        {relatedContacts(data, contact).length}{' '}
        条对象关系。案件、材料及其他对象不会被删除，程序中已记录的法院、法官名称会保留。
      </p>
    </Dialog>
  );
}
