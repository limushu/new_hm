import type { Workspace } from '../domain/types';
import type { ResourceRef } from './contracts';
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
  if (['milestone', 'proceeding'].includes(ref.kind)) return 'node';
  if (ref.kind === 'party') return 'person';
  if (ref.kind === 'contact')
    return ['court', 'organization'].includes(
      data.contacts.find((c) => c.id === ref.id)?.kind ?? '',
    )
      ? 'organization'
      : 'person';
  if (ref.kind === 'material') {
    const item = data.materials.find((m) => m.id === ref.id);
    return item?.kind === 'file' && /\.(m4a|mp3|wav|webm|ogg)$/i.test(item.name)
      ? 'recording'
      : item?.kind === 'file' && /\.(md|txt|docx?)$/i.test(item.name)
        ? 'document'
        : 'material';
  }
  return resourceGroups.some((g) => g.id === ref.kind) ? ref.kind : 'other';
}
