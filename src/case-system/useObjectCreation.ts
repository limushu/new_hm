import { useRef } from 'react';
import type { Commands, SaveAction, Workspace } from '../domain/types';
import type { ResourceRef } from './contracts';
import type { CreationProperties } from './objects';
import { command } from '../services/repository';

/** Creation and attribute completion are distinct durable steps. A retry completes
 * attributes on the saved identities, and never creates/imports the body twice. */
export function useObjectCreation(
  caseId: string,
  data: Workspace,
  properties: CreationProperties,
  save: SaveAction,
  onCreated?: (resources: ResourceRef[]) => Promise<void>,
) {
  const baseline = useRef(
    new Set(data.materials.filter((m) => m.caseId === caseId).map((m) => m.id)),
  );
  const pending = useRef<{ signature: string; result: unknown; resources: ResourceRef[] } | null>(
    null,
  );
  const reset = () => {
    pending.current = null;
    baseline.current = new Set(data.materials.filter((m) => m.caseId === caseId).map((m) => m.id));
  };
  const create: SaveAction = async <K extends keyof Commands>(
    name: K,
    args: Commands[K]['args'],
  ) => {
    const signature = JSON.stringify([name, args]);
    if (pending.current && pending.current.signature !== signature)
      throw new Error('对象正文已保存，请先用原内容重试完成属性保存，再从详情修改正文。');
    if (!pending.current) {
      const result = await save(name, args),
        a = args as Record<string, unknown>,
        input = a.input as { id?: string; contactId?: string; task?: { id: string } } | undefined;
      const kinds: Record<string, string> = {
        save_case_event: 'milestone',
        save_work_record: 'record',
        save_record: 'record',
        save_work_task: 'task',
        save_work_ledger: 'ledger',
        save_ledger: 'ledger',
        save_contact: 'contact',
        save_contact_link: 'contact',
        save_calendar_event: 'event',
        save_work_event: 'event',
      };
      let resources: ResourceRef[] = [];
      if (kinds[name]) {
        const id = name === 'save_contact_link' ? input?.contactId : (input?.task?.id ?? input?.id);
        if (id) resources = [{ kind: kinds[name], id }];
      } else if (name === 'create_text_document')
        resources = [{ kind: 'material', id: result as string }];
      else if (['import_material_paths', 'pick_materials', 'load_workspace'].includes(name)) {
        const snapshot =
          name === 'load_workspace' ? (result as Workspace) : await command('load_workspace', {});
        resources = snapshot.materials
          .filter((m) => m.caseId === caseId && !m.deletedAt && !baseline.current.has(m.id))
          .map((m) => ({ kind: 'material', id: m.id }));
      }
      pending.current = { signature, result, resources };
    }
    return (await complete()) as Commands[K]['result'];
  };
  async function complete() {
    if (!pending.current) throw new Error('尚未保存对象，请重新选择文件或完成创建。');
    try {
      if (pending.current.resources.length)
        await save('apply_object_properties', {
          input: {
            caseId,
            resources: pending.current.resources,
            ...properties,
            tags: properties.tags.map((t) => t.trim()).filter(Boolean),
          },
        });
      await onCreated?.(pending.current.resources);
    } catch (reason) {
      throw new Error(
        `对象正文已保存，公共属性未保存：${String(reason)}。可重试保存属性，不会重复创建正文。`,
      );
    }
    const result = pending.current.result;
    for (const ref of pending.current.resources)
      if (ref.kind === 'material') baseline.current.add(ref.id);
    pending.current = null;
    return result;
  }
  return { save: create, reset, complete };
}
