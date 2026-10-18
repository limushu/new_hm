// Explicit development-only, in-memory adapter. Never selected by an installed app.
import type {
  Commands,
  Workspace,
  CaseFile,
  CaseInput,
  ProceedingInput,
  CalendarEvent,
  WorkLink,
  WorkScope,
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
  workLinks: [],
  taskWork: [],
  feePlans: [],
  feeAllocations: [],
  confirmedFeeCases: [],
  workflowTemplates: [
    ...[
      ['first_instance', '一审'],
      ['appeal', '二审'],
      ['retrial', '再审'],
    ].map(([id, name]) => ({
      id,
      name,
      category: 'litigation' as const,
      stages: ['材料准备', '立案', '举证', '开庭', '裁判'],
    })),
    {
      id: 'enforcement',
      name: '执行',
      category: 'litigation',
      stages: ['申请执行', '执行立案', '财产调查', '执行措施', '执行结果'],
    },
    {
      id: 'contract_review',
      name: '合同审查',
      category: 'non_litigation',
      stages: ['需求确认', '资料审阅', '意见沟通', '成果交付'],
    },
    {
      id: 'advisory',
      name: '专项顾问',
      category: 'non_litigation',
      stages: ['委托确认', '调查分析', '方案沟通', '成果交付'],
    },
  ],
  caseParties: [],
  proceedingPartyRoles: [],
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
      name: '一审',
      category: 'litigation',
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
  stages: ['材料准备', '立案', '举证', '开庭', '裁判', '庭前准备'].map((name, position) => ({
    id: crypto.randomUUID(),
    proceedingId: 'demo-program',
    name,
    position,
    state: name === '庭前准备' ? 'current' : 'pending',
  })),
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
function validateScope(caseId: string, scope: WorkScope) {
  if (findCase(caseId).deletedAt) throw new Error('案件已删除');
  if (
    scope.proceedingId &&
    !data.proceedings.some((p) => p.id === scope.proceedingId && p.caseId === caseId)
  )
    throw new Error('流程不属于此案件');
  if (
    scope.stageId &&
    !data.stages.some((s) => s.id === scope.stageId && s.proceedingId === scope.proceedingId)
  )
    throw new Error('阶段不属于所选流程');
}
function writeLink(link: WorkLink) {
  validateScope(link.caseId, link);
  const resources = {
    task: data.tasks,
    event: data.calendarEvents,
    material: data.materials,
    record: data.workRecords,
    ledger: data.ledgerEntries,
  }[link.kind];
  if (!resources.some((r) => r.id === link.resourceId && r.caseId === link.caseId))
    throw new Error('只能关联本案件的记录');
  const existing = data.workLinks.find((l) => l.id === link.id);
  if (
    existing &&
    (existing.caseId !== link.caseId ||
      existing.kind !== link.kind ||
      existing.resourceId !== link.resourceId)
  )
    throw new Error('关联归属不一致');
  if (link.kind !== 'material')
    data.workLinks = data.workLinks.filter(
      (l) => l.kind !== link.kind || l.resourceId !== link.resourceId,
    );
  const duplicate = data.workLinks.find(
    (l) =>
      l.kind === link.kind &&
      l.resourceId === link.resourceId &&
      l.proceedingId === link.proceedingId &&
      l.stageId === link.stageId,
  );
  if (duplicate) duplicate.label = link.label;
  else data.workLinks.push({ ...link });
}
function writeScope(caseId: string, kind: WorkLink['kind'], id: string, scope: WorkScope) {
  data.workLinks = data.workLinks.filter((l) => l.kind !== kind || l.resourceId !== id);
  if (scope.proceedingId)
    writeLink({
      id: crypto.randomUUID(),
      caseId,
      kind,
      resourceId: id,
      proceedingId: scope.proceedingId,
      stageId: scope.stageId,
      label: '',
    });
}
export async function previewCommand<K extends keyof Commands>(
  name: K,
  args: Commands[K]['args'],
): Promise<Commands[K]['result']> {
  const a = args as Record<string, unknown>;
  let result: unknown = null;
  switch (name) {
    case 'save_work_link':
      writeLink(a.input as WorkLink);
      break;
    case 'delete_work_link':
      data.workLinks = data.workLinks.filter((l) => l.id !== a.id);
      break;
    case 'save_work_task': {
      const v = a.input as Commands['save_work_task']['args']['input'];
      validateScope(v.task.caseId, v);
      if (!v.task.title.trim()) throw new Error('请填写待办内容');
      const old = data.tasks.find((t) => t.id === v.task.id);
      if (old && old.caseId !== v.task.caseId) throw new Error('不能修改其他案件的任务');
      if (old) Object.assign(old, v.task, { title: v.task.title.trim() });
      else data.tasks.push({ ...v.task, title: v.task.title.trim() });
      const work = { taskId: v.task.id, waitingFor: v.waitingFor, outcome: v.outcome };
      const meta = data.taskWork.find((w) => w.taskId === v.task.id);
      if (meta) Object.assign(meta, work);
      else data.taskWork.push(work);
      writeScope(v.task.caseId, 'task', v.task.id, v);
      break;
    }
    case 'apply_stage_tasks': {
      const stage = data.stages.find((s) => s.id === a.stageId)!;
      const p = data.proceedings.find((p) => p.id === stage.proceedingId)!;
      for (const title of a.titles as string[]) {
        if (
          !data.tasks.some(
            (t) =>
              t.title === title.trim() &&
              data.workLinks.some(
                (l) => l.kind === 'task' && l.resourceId === t.id && l.stageId === stage.id,
              ),
          )
        )
          await previewCommand('save_work_task', {
            input: {
              task: {
                id: crypto.randomUUID(),
                caseId: p.caseId,
                title: title.trim(),
                dueDate: null,
                completed: false,
              },
              waitingFor: '',
              outcome: '',
              proceedingId: p.id,
              stageId: stage.id,
            },
          });
      }
      break;
    }
    case 'save_work_event': {
      const v = a as unknown as Commands['save_work_event']['args'];
      if (v.input.caseId) validateScope(v.input.caseId, v);
      await previewCommand('save_calendar_event', { input: v.input });
      if (v.input.caseId) writeScope(v.input.caseId, 'event', v.input.id, v);
      break;
    }
    case 'save_work_record': {
      const v = a as unknown as Commands['save_work_record']['args'];
      validateScope(v.input.caseId, v);
      await previewCommand('save_record', { input: v.input });
      writeScope(v.input.caseId, 'record', v.input.id, v);
      break;
    }
    case 'save_work_ledger': {
      const v = a as unknown as Commands['save_work_ledger']['args'];
      const scope = { proceedingId: v.input.proceedingId, stageId: v.stageId };
      validateScope(v.input.caseId, scope);
      const allocated = data.feeAllocations
        .filter((x) => x.ledgerId === v.input.id)
        .reduce((n, x) => n + x.amountCents, 0);
      if (
        allocated &&
        (v.input.amountCents < allocated ||
          v.input.kind !== 'income' ||
          v.input.category !== '律师费')
      )
        throw new Error('此收款已用于核销，请先调整核销关联');
      if (v.sourcePath)
        await previewCommand('save_ledger_with_receipt', {
          input: v.input,
          sourcePath: v.sourcePath,
          receiptId: v.receiptId!,
        });
      else await previewCommand('save_ledger', { input: v.input });
      writeScope(v.input.caseId, 'ledger', v.input.id, scope);
      const receipt = data.ledgerEntries.find((e) => e.id === v.input.id)?.materialId;
      if (receipt && v.sourcePath && scope.stageId && scope.proceedingId)
        writeLink({
          id: crypto.randomUUID(),
          caseId: v.input.caseId,
          kind: 'material',
          resourceId: receipt,
          proceedingId: scope.proceedingId,
          stageId: scope.stageId,
          label: '费用凭据',
        });
      break;
    }
    case 'save_fee_agreement': {
      const caseId = a.caseId as string;
      const amount = a.amountCents as number;
      findCase(caseId);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('约定金额无效');
      const old = data.caseDetails.find((d) => d.caseId === caseId);
      if (old) old.agreedFeeCents = amount;
      else
        data.caseDetails.push({ caseId, agreedFeeCents: amount, notes: '', relatedCaseId: null });
      if (!data.confirmedFeeCases.includes(caseId)) data.confirmedFeeCases.push(caseId);
      break;
    }
    case 'save_fee_plan': {
      const v = a.input as Workspace['feePlans'][number];
      validateScope(v.caseId, v);
      if (!v.title.trim() || !Number.isSafeInteger(v.amountCents) || v.amountCents <= 0)
        throw new Error('收费名称或金额无效');
      if (
        data.feeAllocations
          .filter((x) => x.planId === v.id)
          .reduce((n, x) => n + x.amountCents, 0) > v.amountCents
      )
        throw new Error('约定金额不能少于已核销金额');
      const old = data.feePlans.find((p) => p.id === v.id);
      if (old && old.caseId !== v.caseId) throw new Error('不能修改其他案件的收费计划');
      if (old) Object.assign(old, v);
      else data.feePlans.push({ ...v });
      break;
    }
    case 'delete_fee_plan':
      data.feePlans = data.feePlans.filter((p) => p.id !== a.id);
      data.feeAllocations = data.feeAllocations.filter((x) => x.planId !== a.id);
      break;
    case 'save_fee_allocation': {
      const v = a.input as Workspace['feeAllocations'][number];
      const p = data.feePlans.find((p) => p.id === v.planId),
        e = data.ledgerEntries.find((e) => e.id === v.ledgerId);
      if (
        !p ||
        !e ||
        p.caseId !== e.caseId ||
        e.kind !== 'income' ||
        e.category !== '律师费' ||
        v.amountCents < 0
      )
        throw new Error('只能使用本案实际收到的律师费核销');
      const planUsed = data.feeAllocations
          .filter((x) => x.planId === v.planId && x.ledgerId !== v.ledgerId)
          .reduce((n, x) => n + x.amountCents, 0),
        entryUsed = data.feeAllocations
          .filter((x) => x.ledgerId === v.ledgerId && x.planId !== v.planId)
          .reduce((n, x) => n + x.amountCents, 0);
      if (planUsed + v.amountCents > p.amountCents || entryUsed + v.amountCents > e.amountCents)
        throw new Error('核销不能超过收费节点或实际收款金额');
      data.feeAllocations = data.feeAllocations.filter(
        (x) => x.planId !== v.planId || x.ledgerId !== v.ledgerId,
      );
      if (v.amountCents) data.feeAllocations.push({ ...v });
      break;
    }
    case 'pick_receipt_file':
      throw new Error('浏览器预览请使用文件选择框');
    case 'save_ledger_with_receipt': {
      const input = a.input as Commands['save_ledger_with_receipt']['args']['input'];
      const file = previewFiles.get(a.sourcePath as string);
      if (!file) throw new Error('凭据文件不可用，请重新选择');
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
        throw new Error('金额必须大于0');
      const c = findCase(input.caseId);
      if (c.deletedAt) throw new Error('案件已删除');
      const existing = data.ledgerEntries.find((r) => r.id === input.id);
      if (existing && existing.caseId !== input.caseId) throw new Error('不能修改其他案件的收支');
      const id = a.receiptId as string;
      const old = data.materials.find((m) => m.id === id);
      if (old && (old.caseId !== input.caseId || old.proceedingId !== input.proceedingId))
        throw new Error('凭据归属不一致');
      if (!old) {
        data.materials.push({
          id,
          caseId: input.caseId,
          proceedingId: input.proceedingId,
          parentId: null,
          name: file.name,
          kind: 'file',
          size: file.size,
          notes: '',
          recordId: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
          trashGroup: null,
        });
        previewFiles.set(id, file);
      }
      const row = { ...input, materialId: id };
      if (existing) Object.assign(existing, row);
      else data.ledgerEntries.push(row);
      break;
    }
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
        for (const p of data.caseParties)
          if (p.contactId === input.id) p.name = input.name as string;
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
      if (name === 'save_stage') {
        const previousState = (exists as { state?: string } | undefined)?.state;
        const program = data.proceedings.find((p) => p.id === input.proceedingId)!;
        if (program.state === 'completed') throw new Error('程序已办结，请先恢复办理再调整阶段');
        const labels: Record<string, string> = {
          pending: '待办理',
          current: '当前办理',
          done: '已完成',
          skipped: '已跳过',
        };
        const oldFocus = data.stages.find(
          (s) => s.proceedingId === program.id && s.id !== input.id && s.state === 'current',
        );
        if ((exists && previousState !== input.state) || (!exists && input.state === 'current')) {
          const action =
            input.state === 'done'
              ? '完成阶段'
              : input.state === 'skipped'
                ? '跳过阶段'
                : input.state === 'pending'
                  ? previousState === 'done' || previousState === 'skipped'
                    ? '重新打开阶段'
                    : '阶段转为待办理'
                  : previousState === 'done' || previousState === 'skipped'
                    ? '重新办理阶段'
                    : '设为当前阶段';
          data.caseEvents.unshift({
            id: crypto.randomUUID(),
            caseId: program.caseId,
            proceedingId: input.proceedingId as string,
            title: `${action}：${input.name}`,
            eventDate: dateKey(new Date()),
            notes:
              `${labels[previousState ?? ''] || '未设置'} → ${labels[input.state as string]}` +
              (input.state === 'current' && oldFocus
                ? `；原当前阶段「${oldFocus.name}」仍待办理，未自动标记完成。`
                : ''),
            kind: 'stage_change',
          });
        }
        if (input.state === 'current') {
          data.stages
            .filter(
              (stage) =>
                stage.proceedingId === input.proceedingId &&
                stage.state === 'current' &&
                stage.id !== input.id,
            )
            .forEach((stage) => (stage.state = 'pending'));
          program.stage = input.name as string;
        } else if (previousState === 'current') program.stage = '';
      }
      if (exists) Object.assign(exists, input);
      else rows.push({ ...input });
      break;
    }
    case 'delete_contact':
      for (const p of data.caseParties) if (p.contactId === a.id) p.contactId = null;
      data.contacts = data.contacts.filter((row) => row.id !== a.id);
      data.contactLinks = data.contactLinks.filter((row) => row.contactId !== a.id);
      data.contactRelations = data.contactRelations.filter(
        (row) => row.courtId !== a.id && row.judgeId !== a.id,
      );
      break;
    case 'delete_contact_link':
      for (const p of data.caseParties) if ('party-' + p.id === a.id) p.contactId = null;
      data.contactLinks = data.contactLinks.filter((row) => row.id !== a.id);
      break;
    case 'delete_ledger':
      data.ledgerEntries = data.ledgerEntries.filter((row) => row.id !== a.id);
      data.feeAllocations = data.feeAllocations.filter((x) => x.ledgerId !== a.id);
      data.workLinks = data.workLinks.filter((l) => l.kind !== 'ledger' || l.resourceId !== a.id);
      break;
    case 'delete_stage': {
      const stage = data.stages.find((row) => row.id === a.id);
      if (!stage) throw new Error('未找到对应案件或记录');
      const program = data.proceedings.find((p) => p.id === stage.proceedingId)!;
      if (program.state === 'completed') throw new Error('程序已办结，请先恢复办理再调整阶段');
      data.stages = data.stages.filter((row) => row.id !== a.id);
      data.workLinks.forEach((l) => {
        if (l.stageId === a.id) l.stageId = null;
      });
      data.feePlans.forEach((p) => {
        if (p.stageId === a.id) p.stageId = null;
      });
      if (stage.state === 'current') program.stage = '';
      data.stages
        .filter((row) => row.proceedingId === program.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .forEach((row, index) => (row.position = index));
      const labels = { pending: '待办理', current: '当前办理', done: '已完成', skipped: '已跳过' };
      data.caseEvents.unshift({
        id: crypto.randomUUID(),
        caseId: program.caseId,
        proceedingId: program.id,
        title: `删除阶段：${stage.name}`,
        eventDate: dateKey(new Date()),
        notes: `删除前：${labels[stage.state]}。既有事件与程序材料保留。${stage.state === 'current' ? '当前办理已清空，未自动切换其他阶段。' : ''}`,
        kind: 'stage_change',
      });
      break;
    }
    case 'reorder_stages':
      (a.ids as string[]).forEach((id, index) => {
        const row = data.stages.find((s) => s.id === id);
        if (row) row.position = index;
      });
      break;
    case 'save_case_status': {
      const input = a.input as Workspace['statuses'][number];
      const old = data.statuses.find((s) => s.id === input.id);
      if (
        old?.name.toLowerCase() !== input.name.trim().toLowerCase() &&
        data.statuses.some(
          (s) => s.id !== input.id && s.name.toLowerCase() === input.name.trim().toLowerCase(),
        )
      )
        throw new Error('已有同名案件状态，请选择已有状态');
      if (old) Object.assign(old, { ...input, name: input.name.trim() });
      else data.statuses.push({ ...input, name: input.name.trim() });
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
        if (target.stageId && target.proceedingId)
          writeLink({
            id: crypto.randomUUID(),
            caseId: target.caseId,
            kind: 'material',
            resourceId: id,
            proceedingId: target.proceedingId,
            stageId: target.stageId,
            label: '',
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
        else {
          const parties = new Set(data.caseParties.filter((p) => p.caseId === id).map((p) => p.id));
          data.caseParties = data.caseParties.filter((p) => p.caseId !== id);
          data.proceedingPartyRoles = data.proceedingPartyRoles.filter(
            (r) => !parties.has(r.partyId),
          );
          data.proceedings = data.proceedings.filter((p) => p.caseId !== id);
          data.contactLinks = data.contactLinks.filter((l) => l.caseId !== id);
          data.cases = data.cases.filter((c) => c.id !== id);
        }
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
      result = data;
      break;
    case 'create_case': {
      const input = a.input as CaseInput;
      if (!input.title.trim()) throw new Error('请输入案件名称');
      let c = data.cases.find((c) => c.id === input.id);
      if (!c) {
        c = {
          ...input,
          title: input.title.trim(),
          currentProceedingId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        data.cases.unshift(c);
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
    case 'save_workflow_template': {
      const input = a.input as Commands['save_workflow_template']['args']['input'];
      const value = {
        ...input,
        name: input.name.trim(),
        stages: input.stages.map((s) => s.trim()),
      };
      if (
        !value.name ||
        value.name.length > 80 ||
        value.stages.length > 40 ||
        value.stages.some((s) => !s || s.length > 80)
      )
        throw new Error('模板名称或阶段无效');
      if (new Set(value.stages.map((s) => s.toLowerCase())).size !== value.stages.length)
        throw new Error('模板中的阶段名称不能重复');
      if (
        data.workflowTemplates.some(
          (t) => t.id !== value.id && t.name.toLowerCase() === value.name.toLowerCase(),
        )
      )
        throw new Error('已有同名流程模板');
      const old = data.workflowTemplates.find((t) => t.id === value.id);
      if (old) Object.assign(old, value);
      else data.workflowTemplates.push(value);
      break;
    }
    case 'delete_workflow_template':
      data.workflowTemplates = data.workflowTemplates.filter((t) => t.id !== a.id);
      break;
    case 'rename_proceeding': {
      const p = data.proceedings.find((p) => p.id === a.id)!;
      const name = (a.name as string).trim();
      if (!name || name.length > 80) throw new Error('请输入流程名称（最多80字）');
      p.name = name;
      break;
    }
    case 'save_case_party': {
      const {
        proceedingId,
        role: raw,
        ...input
      } = a.input as Commands['save_case_party']['args']['input'];
      const owner = findCase(input.caseId);
      if (owner.deletedAt) throw new Error('案件已删除');
      if (
        proceedingId &&
        !data.proceedings.some((p) => p.id === proceedingId && p.caseId === input.caseId)
      )
        throw new Error('流程不属于此案件');
      const contact = data.contacts.find((c) => c.id === input.contactId);
      if (input.contactId && !contact) throw new Error('联系对象不存在');
      const value = {
        ...input,
        name: contact?.name ?? input.name.trim(),
        serviceType: input.serviceType.trim(),
      };
      const role = raw.trim();
      if (
        (!value.name && !role) ||
        value.name.length > 120 ||
        role.length > 80 ||
        value.serviceType.length > 80
      )
        throw new Error('请填写名称或当前流程中的身份');
      if (role && !proceedingId) throw new Error('请为身份选择办理流程');
      const old = data.caseParties.find((p) => p.id === input.id);
      if (old && old.caseId !== input.caseId) throw new Error('当事人不属于此案件');
      if (old) Object.assign(old, value);
      else data.caseParties.push(value);
      if (proceedingId) {
        data.proceedingPartyRoles = data.proceedingPartyRoles.filter(
          (r) => !(r.partyId === input.id && r.proceedingId === proceedingId),
        );
        if (role) data.proceedingPartyRoles.push({ partyId: input.id, proceedingId, role });
      }
      data.contactLinks = data.contactLinks.filter((l) => l.id !== 'party-' + input.id);
      if (value.contactId)
        data.contactLinks.push({
          id: 'party-' + input.id,
          contactId: value.contactId,
          caseId: value.caseId,
          proceedingId: null,
          role: { client: '我方委托人', opponent: '对方当事人', other: '其他参与人' }[value.side],
        });
      break;
    }
    case 'delete_case_party':
      data.caseParties = data.caseParties.filter((p) => p.id !== a.id);
      data.proceedingPartyRoles = data.proceedingPartyRoles.filter((r) => r.partyId !== a.id);
      data.contactLinks = data.contactLinks.filter((l) => l.id !== 'party-' + a.id);
      break;
    case 'add_proceeding': {
      const id = crypto.randomUUID();
      const c = findCase(a.caseId as string);
      const template = data.workflowTemplates.find((t) => t.id === a.kind);
      if (!template || c.deletedAt) throw new Error('流程模板或案件不存在');
      if (a.parentId && !data.proceedings.some((p) => p.id === a.parentId && p.caseId === c.id))
        throw new Error('前序流程必须属于同一案件');
      data.proceedings.push({
        id,
        caseId: c.id,
        kind: template.id,
        name: (a.name as string | undefined)?.trim() || template.name,
        category: template.category,
        parentId: (a.parentId as string | null) ?? null,
        state: 'active',
        completedAt: null,
        stage: template.stages[0] ?? '',
        caseNumber: '',
        court: '',
        judge: '',
      });
      template.stages.forEach((name, position) =>
        data.stages.push({
          id: crypto.randomUUID(),
          proceedingId: id,
          name,
          position,
          state: position === 0 ? 'current' : 'pending',
        }),
      );
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
