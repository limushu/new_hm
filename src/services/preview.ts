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
import { dateKey } from '../domain/calendar';

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
};
function findCase(id: string): CaseFile {
  const value = data.cases.find((c) => c.id === id);
  if (!value) throw new Error('未找到案件');
  return value;
}
export async function previewCommand<K extends keyof Commands>(
  name: K,
  args: Commands[K]['args'],
): Promise<Commands[K]['result']> {
  const a = args as Record<string, unknown>;
  let result: unknown = null;
  switch (name) {
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
            stage: '',
            caseNumber: '',
            court: '',
            judge: '',
          });
      }
      result = c;
      break;
    }
    case 'update_case': {
      const input = a.input as CaseInput;
      if (!input.title.trim()) throw new Error('请输入案件名称');
      Object.assign(findCase(input.id), input);
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
        stage: '',
        caseNumber: '',
        court: '',
        judge: '',
      });
      c.currentProceedingId = id;
      result = id;
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
