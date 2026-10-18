// Explicit development-only, in-memory adapter. Never selected by an installed app.
import type {
  Commands,
  Workspace,
  CaseFile,
  CaseInput,
  ProceedingInput,
  ProgramKind,
  CalendarEvent,
} from '../domain/types';
import type { MaterialTarget, RecordInput } from '../domain/types';
import { dateKey } from '../domain/calendar';

const previewFiles = new Map<string, { name: string; url: string; size: number }>();
export function registerPreviewFiles(files: File[]) {
  return files.map((file) => {
    const id = crypto.randomUUID();
    previewFiles.set(id, { name: file.name, url: URL.createObjectURL(file), size: file.size });
    return id;
  });
}
const settings: Record<string, string> = { close_to_tray: 'true', notifications: 'true' };
const now = new Date().toISOString();
const data: Workspace = {
  statuses: [
    { id: 'not_started', name: '未开始', color: '#96938b' },
    { id: 'in_progress', name: '进行中', color: '#7098b9' },
    { id: 'closed', name: '已结案', color: '#7e9b85' },
  ],
  cases: [
    {
      id: 'demo',
      title: '张某与李某借款纠纷（示例）',
      caseType: 'civil',
      statusId: 'in_progress',
      currentProceedingId: 'demo-program',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  proceedings: [
    {
      id: 'demo-program',
      caseId: 'demo',
      kind: 'first_instance',
      parentId: null,
      state: 'active',
      completedAt: null,
      stage: '庭前准备',
      caseNumber: '',
      court: '',
      judge: '',
    },
  ],
  tasks: [
    {
      id: 'demo-task',
      caseId: 'demo',
      title: '核对当事人提供的材料',
      dueDate: dateKey(new Date()),
      completed: false,
    },
  ],
  workRecords: [],
  calendarEvents: [],
  materials: [],
  contacts: [],
  contactLinks: [],
  contactRelations: [],
  ledgerEntries: [],
  caseDetails: [],
  stages: [],
  caseEvents: [],
  tagCatalog: [],
  caseTags: [],
  deletedRecords: [],
};
function findCase(id: string): CaseFile {
  const value = data.cases.find((c) => c.id === id);
  if (!value) throw new Error('未找到案件');
  return value;
}
function writeTags(caseId: string, tags: string[]) {
  const names = [...new Set(tags.map((t) => t.trim().replace(/^#+/, '').toLowerCase()))];
  data.caseTags = data.caseTags
    .filter((t) => t.caseId !== caseId)
    .concat(names.map((tag) => ({ caseId, tag })));
  data.tagCatalog = [...new Set([...data.tagCatalog, ...names])].sort();
}
export async function previewCommand<K extends keyof Commands>(
  name: K,
  args: Commands[K]['args'],
): Promise<Commands[K]['result']> {
  const a = args as Record<string, unknown>;
  let result: unknown = null;
  switch (name) {
    case 'set_proceeding_contacts': {
      const input = a.input as Commands['set_proceeding_contacts']['args']['input'];
      const p = data.proceedings.find((p) => p.id === input.proceedingId)!;
      if (input.judgeId && !input.courtId) throw new Error('请先选择办理法院');
      data.contactLinks = data.contactLinks.filter(
        (l) => !(l.proceedingId === p.id && ['法院', '法官'].includes(l.role)),
      );
      for (const [id, role] of [
        [input.courtId, '法院'],
        [input.judgeId, '法官'],
      ])
        if (id)
          data.contactLinks.push({
            id: crypto.randomUUID(),
            caseId: p.caseId,
            contactId: id,
            proceedingId: p.id,
            role: role!,
          });
      p.court = data.contacts.find((c) => c.id === input.courtId)?.name ?? '';
      p.judge = data.contacts.find((c) => c.id === input.judgeId)?.name ?? '';
      if (
        input.courtId &&
        input.judgeId &&
        !data.contactRelations.some(
          (r) => r.judgeId === input.judgeId && r.courtId === input.courtId,
        )
      )
        data.contactRelations.push({ judgeId: input.judgeId, courtId: input.courtId });
      break;
    }
    case 'seed_example':
      result = 'demo';
      break;
    case 'get_settings':
      result = settings;
      break;
    case 'set_setting':
      settings[a.key as string] = a.value as string;
      break;
    case 'background_status':
      result = {};
      break;
    case 'get_update_status':
      result = null;
      break;
    case 'autostart_status':
      result = false;
      break;
    case 'due_reminders':
      result = [];
      break;
    case 'acknowledge_reminder':
      break;
    case 'save_contact':
    case 'save_contact_link':
    case 'save_ledger':
    case 'save_case_detail':
    case 'save_stage':
    case 'save_case_event': {
      const input = a.input as Record<string, unknown>;
      if (name === 'save_contact') {
        const courts = a.courtIds as string[] | undefined;
        if (courts) {
          data.contactRelations = data.contactRelations.filter((r) => r.judgeId !== input.id);
          data.contactRelations.push(
            ...courts.map((courtId) => ({ judgeId: input.id as string, courtId })),
          );
        }
        for (const p of data.proceedings)
          if (data.contactLinks.some((l) => l.proceedingId === p.id && l.contactId === input.id)) {
            if (input.kind === 'court') p.court = input.name as string;
            if (input.kind === 'judge') p.judge = input.name as string;
          }
      }
      const key = (
        {
          save_contact: 'contacts',
          save_contact_link: 'contactLinks',
          save_ledger: 'ledgerEntries',
          save_case_detail: 'caseDetails',
          save_stage: 'stages',
          save_case_event: 'caseEvents',
        } as const
      )[
        name as
          | 'save_contact'
          | 'save_contact_link'
          | 'save_ledger'
          | 'save_case_detail'
          | 'save_stage'
          | 'save_case_event'
      ];
      const rows = data[key] as unknown as Array<{ id?: string; caseId?: string }>;
      const exists = rows.find((row) =>
        name === 'save_case_detail' ? row.caseId === input.caseId : row.id === input.id,
      );
      if (name === 'save_stage' && input.state === 'current') {
        if (!exists || (exists as { state?: string }).state !== 'current')
          data.caseEvents.unshift({
            id: crypto.randomUUID(),
            caseId: data.proceedings.find((p) => p.id === input.proceedingId)!.caseId,
            proceedingId: input.proceedingId as string,
            title: `切换阶段：${input.name}`,
            eventDate: dateKey(new Date()),
            notes: '',
            kind: 'stage_change',
          });
        data.stages
          .filter(
            (stage) =>
              stage.proceedingId === input.proceedingId &&
              stage.state === 'current' &&
              stage.id !== input.id,
          )
          .forEach((stage) => (stage.state = 'done'));
        const program = data.proceedings.find((program) => program.id === input.proceedingId);
        if (program) program.stage = input.name as string;
      }
      if (exists) Object.assign(exists, input);
      else rows.push({ ...input });
      break;
    }
    case 'delete_contact':
      data.contacts = data.contacts.filter((row) => row.id !== a.id);
      data.contactLinks = data.contactLinks.filter((row) => row.contactId !== a.id);
      data.contactRelations = data.contactRelations.filter(
        (row) => row.courtId !== a.id && row.judgeId !== a.id,
      );
      break;
    case 'delete_contact_link':
      data.contactLinks = data.contactLinks.filter((row) => row.id !== a.id);
      break;
    case 'delete_ledger':
      data.ledgerEntries = data.ledgerEntries.filter((row) => row.id !== a.id);
      break;
    case 'delete_stage':
      data.stages = data.stages.filter((row) => row.id !== a.id);
      break;
    case 'reorder_stages':
      (a.ids as string[]).forEach((id, index) => {
        const row = data.stages.find((s) => s.id === id);
        if (row) row.position = index;
      });
      break;
    case 'save_case_status': {
      const input = a.input as Workspace['statuses'][number];
      const old = data.statuses.find((s) => s.id === input.id);
      if (old) Object.assign(old, input);
      else data.statuses.push({ ...input });
      break;
    }
    case 'delete_case_status':
      data.statuses = data.statuses.filter((row) => row.id !== a.id);
      break;
    case 'save_record': {
      const input = a.input as RecordInput;
      const old = data.workRecords.find((row) => row.id === input.id);
      if (old) old.body = input.body;
      else data.workRecords.unshift({ ...input, createdAt: new Date().toISOString() });
      break;
    }
    case 'create_material_folder': {
      const target = a.target as MaterialTarget;
      const id = crypto.randomUUID();
      data.materials.push({
        id,
        ...target,
        recordId: target.recordId ?? null,
        name: a.name as string,
        kind: 'folder',
        size: 0,
        notes: '',
        createdAt: new Date().toISOString(),
        deletedAt: null,
        trashGroup: null,
      });
      result = id;
      break;
    }
    case 'import_material_paths': {
      const target = a.target as MaterialTarget;
      for (const path of a.paths as string[]) {
        const file = previewFiles.get(path);
        if (!file) throw new Error('预览文件不存在');
        let name = file.name;
        let index = 1;
        while (
          data.materials.some(
            (m) =>
              !m.deletedAt &&
              m.caseId === target.caseId &&
              m.parentId === target.parentId &&
              m.proceedingId === target.proceedingId &&
              m.name === name,
          )
        ) {
          const dot = file.name.lastIndexOf('.');
          name =
            dot > 0
              ? file.name.slice(0, dot) + ` (${index++})` + file.name.slice(dot)
              : file.name + ` (${index++})`;
        }
        const id = crypto.randomUUID();
        previewFiles.set(id, file);
        data.materials.push({
          id,
          ...target,
          recordId: target.recordId ?? null,
          name,
          kind: 'file',
          size: file.size,
          notes: '',
          createdAt: new Date().toISOString(),
          deletedAt: null,
          trashGroup: null,
        });
      }
      result = { imported: (a.paths as string[]).length, errors: [] };
      break;
    }
    case 'material_preview':
      result = previewFiles.get(a.id as string)?.url;
      if (!result) throw new Error('预览文件不存在');
      break;
    case 'open_material':
    case 'export_material':
      throw new Error('系统打开和导出请在桌面应用中使用');
    case 'rename_material': {
      const row = data.materials.find((m) => m.id === a.id);
      if (row) row.name = a.name as string;
      break;
    }
    case 'update_material_notes': {
      const row = data.materials.find((m) => m.id === a.id);
      if (row) row.notes = a.notes as string;
      break;
    }
    case 'move_material': {
      const row = data.materials.find((m) => m.id === a.id);
      if (row) Object.assign(row, a.target);
      break;
    }
    case 'trash_item':
    case 'restore_item':
    case 'purge_item': {
      const id = a.id as string;
      if (a.kind === 'case') {
        if (name === 'trash_item') findCase(id).deletedAt = new Date().toISOString();
        else if (name === 'restore_item') findCase(id).deletedAt = null;
        else data.cases = data.cases.filter((c) => c.id !== id);
      } else if (a.kind === 'record') {
        if (name === 'trash_item') {
          const row = data.workRecords.find((r) => r.id === id);
          if (row) data.deletedRecords.unshift(row);
          data.workRecords = data.workRecords.filter((r) => r.id !== id);
        } else if (name === 'restore_item') {
          const row = data.deletedRecords.find((r) => r.id === id);
          if (row) data.workRecords.unshift(row);
          data.deletedRecords = data.deletedRecords.filter((r) => r.id !== id);
        } else data.deletedRecords = data.deletedRecords.filter((r) => r.id !== id);
      } else {
        const ids = new Set([id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const row of data.materials)
            if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
              ids.add(row.id);
              changed = true;
            }
        }
        if (name === 'purge_item') data.materials = data.materials.filter((m) => !ids.has(m.id));
        else
          for (const row of data.materials) {
            if (name === 'trash_item' && ids.has(row.id) && !row.deletedAt) {
              row.deletedAt = new Date().toISOString();
              row.trashGroup = id;
            } else if (name === 'restore_item' && row.trashGroup === id) {
              row.deletedAt = null;
              row.trashGroup = null;
            }
          }
      }
      break;
    }
    case 'choose_backup_directory':
    case 'run_backup':
    case 'pick_restore_backup':
    case 'apply_restore_backup':
    case 'set_autostart':
    case 'check_update':
    case 'install_update':
    case 'quit_app':
      throw new Error('此操作需要桌面应用');

    case 'storage_info':
      result = { portable: false, dataDirectory: '浏览器界面预览，不写入磁盘' };
      break;
    case 'save_calendar_event': {
      const input = a.input as CalendarEvent;
      const existing = data.calendarEvents.find((event) => event.id === input.id);
      if (existing) Object.assign(existing, input);
      else data.calendarEvents.push({ ...input });
      break;
    }
    case 'delete_calendar_event':
      data.calendarEvents = data.calendarEvents.filter((event) => event.id !== a.id);
      break;
    case 'load_workspace':
      for (const program of data.proceedings)
        if (!data.stages.some((s) => s.proceedingId === program.id)) {
          const names =
            program.kind === 'enforcement'
              ? ['申请执行', '执行立案', '财产调查', '执行措施', '执行结果']
              : ['材料准备', '立案', '举证', '开庭', '裁判'];
          const current = program.stage || names[0];
          if (!names.includes(current)) names.push(current);
          program.stage = current;
          names.forEach((name, position) =>
            data.stages.push({
              id: crypto.randomUUID(),
              proceedingId: program.id,
              name,
              position,
              state: name === current ? 'current' : 'pending',
            }),
          );
        }
      result = data;
      break;
    case 'create_case': {
      const input = a.input as CaseInput;
      if (!input.title.trim()) throw new Error('请输入案件名称');
      let c = data.cases.find((c) => c.id === input.id);
      if (!c) {
        const id = input.caseType === 'civil' ? crypto.randomUUID() : null;
        c = {
          ...input,
          title: input.title.trim(),
          currentProceedingId: id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        data.cases.unshift(c);
        if (id)
          data.proceedings.push({
            id,
            caseId: c.id,
            kind: 'first_instance',
            parentId: null,
            state: 'active',
            completedAt: null,
            stage: '',
            caseNumber: '',
            court: '',
            judge: '',
          });
      }
      if (input.tags) writeTags(input.id, input.tags);
      result = c;
      break;
    }
    case 'update_case': {
      const input = a.input as CaseInput;
      if (!input.title.trim()) throw new Error('请输入案件名称');
      Object.assign(findCase(input.id), input);
      if (input.tags) writeTags(input.id, input.tags);
      break;
    }
    case 'set_case_status': {
      const item = findCase(a.id as string);
      if (item.deletedAt || !data.statuses.some((status) => status.id === a.statusId))
        throw new Error('案件或目标状态无效');
      item.statusId = a.statusId as string;
      item.updatedAt = new Date().toISOString();
      break;
    }
    case 'add_proceeding': {
      const id = crypto.randomUUID();
      const c = findCase(a.caseId as string);
      data.proceedings.push({
        id,
        caseId: c.id,
        kind: a.kind as ProgramKind,
        parentId: (a.parentId as string | null) ?? null,
        state: 'active',
        completedAt: null,
        stage: '',
        caseNumber: '',
        court: '',
        judge: '',
      });
      c.currentProceedingId = id;
      result = id;
      break;
    }
    case 'update_proceeding_meta': {
      const input = a.input as Commands['update_proceeding_meta']['args']['input'];
      const p = data.proceedings.find((p) => p.id === input.id)!;
      const ancestors = new Set([p.id]);
      let parent = input.parentId;
      while (parent) {
        if (ancestors.has(parent)) throw new Error('程序承接关系不能形成循环');
        ancestors.add(parent);
        const value = data.proceedings.find((x) => x.id === parent && x.caseId === p.caseId);
        if (!value) throw new Error('前序程序必须属于同一案件');
        parent = value.parentId;
      }
      Object.assign(p, input, {
        completedAt: input.state === 'completed' ? new Date().toISOString() : null,
      });
      if (input.state === 'completed' && findCase(p.caseId).currentProceedingId === p.id)
        findCase(p.caseId).currentProceedingId = null;
      break;
    }
    case 'select_proceeding':
      findCase(a.caseId as string).currentProceedingId = a.proceedingId as string;
      break;
    case 'update_proceeding': {
      const input = a.input as ProceedingInput;
      Object.assign(data.proceedings.find((p) => p.id === input.id)!, input);
      break;
    }
    case 'add_task': {
      const input = a.input as { caseId: string; title: string; dueDate: string | null };
      const id = crypto.randomUUID();
      data.tasks.push({ ...input, title: input.title.trim(), completed: false, id });
      result = id;
      break;
    }
    case 'toggle_task':
      data.tasks.find((t) => t.id === a.id)!.completed = a.completed as boolean;
      break;
    case 'add_record': {
      const id = crypto.randomUUID();
      data.workRecords.unshift({
        id,
        caseId: a.caseId as string,
        body: a.body as string,
        createdAt: new Date().toISOString(),
      });
      result = id;
      break;
    }
    case 'trash_case':
      findCase(a.id as string).deletedAt = new Date().toISOString();
      break;
    case 'restore_case':
      findCase(a.id as string).deletedAt = null;
      break;
  }
  return structuredClone(result) as Commands[K]['result'];
}
