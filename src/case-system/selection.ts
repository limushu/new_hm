import type { Contact, Material, Workspace } from '../domain/types';
import type { ResourceRef } from './contracts';
import type { CaseResource } from './resources';
export const resourceGroups = [
  { id: 'node', label: '关键节点', creator: 'node' },
  { id: 'person', label: '人物', creator: 'person' },
  { id: 'organization', label: '机构', creator: 'organization' },
  { id: 'material', label: '材料', creator: 'import' },
  { id: 'document', label: '文档', creator: 'document' },
  { id: 'recording', label: '录音', creator: 'recording' },
  { id: 'record', label: '工作记录', creator: 'record' },
  { id: 'task', label: '待办', creator: 'task' },
  { id: 'event', label: '日程', creator: 'schedule' },
  { id: 'ledger', label: '费用', creator: 'ledger' },
  { id: 'case', label: '案件', creator: null },
  { id: 'other', label: '其他对象', creator: null },
] as const;
export function resourceGroup(data: Workspace, ref: ResourceRef): string {
  return classify(
    ref,
    data.contacts.find((c) => c.id === ref.id),
    data.materials.find((m) => m.id === ref.id),
  );
}
function classify(ref: ResourceRef, contact?: Contact, item?: Material): string {
  if (['milestone', 'proceeding'].includes(ref.kind)) return 'node';
  if (ref.kind === 'party') return 'person';
  if (ref.kind === 'contact')
    return ['court', 'organization'].includes(contact?.kind ?? '') ? 'organization' : 'person';
  if (ref.kind === 'material') {
    return item?.kind === 'file' && /\.(m4a|mp3|wav|webm|ogg)$/i.test(item.name)
      ? 'recording'
      : item?.kind === 'file' && /\.(md|txt|docx?)$/i.test(item.name)
        ? 'document'
        : 'material';
  }
  return resourceGroups.some((g) => g.id === ref.kind) ? ref.kind : 'other';
}

/** Build selection labels once; searching and selecting never scan the full
 * material/contact directory for every candidate row. */
export function groupResources(data: Workspace, resources: CaseResource[]) {
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const materials = new Map(data.materials.map((m) => [m.id, m]));
  const labels = new Map<string, string>(resourceGroups.map((g) => [g.id, g.label]));
  return resources.map((resource) => {
    const ref = resource.reference;
    const contact = ref.kind === 'contact' ? contacts.get(ref.id) : undefined;
    const material = ref.kind === 'material' ? materials.get(ref.id) : undefined;
    const group = classify(ref, contact, material);
    const detail = contact
      ? [
          { person: '个人', judge: '法官', court: '法院', organization: '机构' }[contact.kind],
          contact.phone || contact.address,
        ]
          .filter(Boolean)
          .join(' · ')
      : labels.get(group);
    return {
      ...resource,
      group,
      detail,
      search:
        `${resource.title} ${contact?.phone ?? ''} ${contact?.address ?? ''}`.toLocaleLowerCase(),
    };
  });
}
