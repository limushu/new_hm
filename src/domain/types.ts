import type { RuntimeManifest } from '../platform/subsystems';
export type CaseType = 'civil' | 'other';
export type ProgramKind = string;
export interface WorkflowTemplate {
  id: string;
  name: string;
  category: 'litigation' | 'non_litigation';
  stages: string[];
}
export interface CaseParty {
  id: string;
  caseId: string;
  contactId: string | null;
  name: string;
  side: 'client' | 'opponent' | 'other';
  serviceType: string;
}
export interface ProceedingPartyRole {
  partyId: string;
  proceedingId: string;
  role: string;
}
export interface CaseStatus {
  id: string;
  name: string;
  color: string;
}
export interface CaseFile {
  id: string;
  title: string;
  caseType: CaseType;
  statusId: string;
  currentProceedingId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Proceeding {
  parentId: string | null;
  state: 'active' | 'completed';
  completedAt: string | null;
  id: string;
  caseId: string;
  kind: ProgramKind;
  name: string;
  category: WorkflowTemplate['category'];
  stage: string;
  caseNumber: string;
  court: string;
  judge: string;
}
export interface Task {
  id: string;
  caseId: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
}
export interface WorkRecord {
  id: string;
  caseId: string;
  body: string;
  createdAt: string;
}
export interface Workspace {
  workLinks: WorkLink[];
  taskWork: TaskWork[];
  feePlans: FeePlan[];
  feeAllocations: FeeAllocation[];
  confirmedFeeCases: string[];
  workflowTemplates: WorkflowTemplate[];
  caseParties: CaseParty[];
  proceedingPartyRoles: ProceedingPartyRole[];
  tagCatalog: string[];
  caseTags: { caseId: string; tag: string }[];
  statuses: CaseStatus[];
  cases: CaseFile[];
  proceedings: Proceeding[];
  tasks: Task[];
  workRecords: WorkRecord[];
  calendarEvents: CalendarEvent[];
  materials: Material[];
  contacts: Contact[];
  contactLinks: ContactLink[];
  contactRelations: ContactRelation[];
  ledgerEntries: LedgerEntry[];
  caseDetails: CaseDetail[];
  stages: Stage[];
  caseEvents: CaseEvent[];
  deletedRecords: WorkRecord[];
}
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  caseId: string | null;
  location: string;
  notes: string;
  reminderMinutes?: number | null;
}
export type SaveAction = <K extends keyof Commands>(
  name: K,
  args: Commands[K]['args'],
) => Promise<Commands[K]['result']>;
export interface CaseInput {
  tags?: string[];
  id: string;
  title: string;
  caseType: CaseType;
  statusId: string;
}
export type ProceedingInput = Pick<Proceeding, 'id' | 'stage' | 'caseNumber' | 'court' | 'judge'>;
export interface Commands {
  subsystem_manifest: { args: Record<string, never>; result: RuntimeManifest };
  resume_runtime: { args: Record<string, never>; result: void };
  get_update_status: {
    args: Record<string, never>;
    result: { version: string; notes: string | null } | null;
  };
  seed_example: { args: { id: string }; result: string };
  storage_info: {
    args: Record<string, never>;
    result: { portable: boolean; dataDirectory: string };
  };
  load_workspace: { args: Record<string, never>; result: Workspace };
  save_calendar_event: { args: { input: CalendarEvent }; result: null };
  delete_calendar_event: { args: { id: string }; result: null };
  create_case: { args: { input: CaseInput }; result: CaseFile };
  update_case: { args: { input: CaseInput }; result: null };
  set_case_status: { args: { id: string; statusId: string }; result: null };
  add_proceeding: {
    args: { caseId: string; kind: ProgramKind; parentId?: string | null; name?: string };
    result: string;
  };
  save_workflow_template: { args: { input: WorkflowTemplate }; result: null };
  delete_workflow_template: { args: { id: string }; result: null };
  rename_proceeding: { args: { id: string; name: string }; result: null };
  save_case_party: {
    args: { input: CaseParty & { proceedingId: string | null; role: string } };
    result: null;
  };
  delete_case_party: { args: { id: string }; result: null };
  update_proceeding_meta: {
    args: { input: { id: string; parentId: string | null; state: 'active' | 'completed' } };
    result: null;
  };
  select_proceeding: { args: { caseId: string; proceedingId: string }; result: null };
  update_proceeding: { args: { input: ProceedingInput }; result: null };
  add_task: {
    args: { input: { caseId: string; title: string; dueDate: string | null } };
    result: string;
  };
  toggle_task: { args: { id: string; completed: boolean }; result: null };
  add_record: { args: { caseId: string; body: string }; result: string };
  trash_case: { args: { id: string }; result: null };
  restore_case: { args: { id: string }; result: null };
}
export const programLabels: Record<ProgramKind, string> = {
  first_instance: '一审',
  appeal: '二审',
  retrial: '再审',
  enforcement: '执行',
};
export const emptyWorkspace: Workspace = {
  workLinks: [],
  taskWork: [],
  feePlans: [],
  feeAllocations: [],
  confirmedFeeCases: [],
  workflowTemplates: [],
  caseParties: [],
  proceedingPartyRoles: [],
  tagCatalog: [],
  caseTags: [],
  statuses: [],
  cases: [],
  proceedings: [],
  tasks: [],
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
  deletedRecords: [],
};

export type WorkScope = { proceedingId: string | null; stageId: string | null };
export interface WorkLink {
  id: string;
  caseId: string;
  proceedingId: string;
  stageId: string | null;
  kind: 'task' | 'event' | 'material' | 'record' | 'ledger';
  resourceId: string;
  label: string;
}
export interface TaskWork {
  taskId: string;
  waitingFor: string;
  outcome: string;
}
export interface FeePlan extends WorkScope {
  id: string;
  caseId: string;
  title: string;
  amountCents: number;
  dueDate: string | null;
  condition: string;
  ready: boolean;
}
export interface FeeAllocation {
  planId: string;
  ledgerId: string;
  amountCents: number;
}
export interface Commands {
  save_work_link: { args: { input: WorkLink }; result: null };
  save_work_event: { args: WorkScope & { input: CalendarEvent }; result: null };
  save_work_record: { args: WorkScope & { input: RecordInput }; result: null };
  save_work_ledger: {
    args: { input: LedgerEntry; stageId: string | null; sourcePath?: string; receiptId?: string };
    result: null;
  };
  delete_work_link: { args: { id: string }; result: null };
  save_work_task: {
    args: { input: WorkScope & { task: Task; waitingFor: string; outcome: string } };
    result: null;
  };
  apply_stage_tasks: { args: { stageId: string; titles: string[] }; result: null };
  save_fee_plan: { args: { input: FeePlan }; result: null };
  delete_fee_plan: { args: { id: string }; result: null };
  save_fee_allocation: { args: { input: FeeAllocation }; result: null };
  save_fee_agreement: { args: { caseId: string; amountCents: number }; result: null };
}

export interface Material {
  id: string;
  caseId: string;
  proceedingId: string | null;
  parentId: string | null;
  name: string;
  kind: 'file' | 'folder';
  size: number;
  notes: string;
  recordId: string | null;
  createdAt: string;
  deletedAt: string | null;
  trashGroup: string | null;
}
export interface MaterialTarget {
  stageId?: string | null;
  caseId: string;
  proceedingId: string | null;
  parentId: string | null;
  recordId?: string | null;
}
export interface Contact {
  id: string;
  name: string;
  kind: 'person' | 'organization' | 'court' | 'judge';
  phone: string;
  address: string;
  notes: string;
}
export interface ContactLink {
  id: string;
  contactId: string;
  caseId: string;
  proceedingId: string | null;
  role: string;
}
export interface ContactRelation {
  judgeId: string;
  courtId: string;
}
export interface LedgerEntry {
  id: string;
  caseId: string;
  proceedingId: string | null;
  kind: 'income' | 'expense';
  amountCents: number;
  entryDate: string;
  category: string;
  notes: string;
  reimbursement: 'none' | 'pending' | 'received';
  materialId: string | null;
}
export interface CaseDetail {
  caseId: string;
  agreedFeeCents: number;
  relatedCaseId: string | null;
  notes: string;
}
export interface Stage {
  id: string;
  proceedingId: string;
  name: string;
  position: number;
  state: 'pending' | 'current' | 'done' | 'skipped';
}
export interface CaseEvent {
  kind?: 'milestone' | 'stage_change';
  id: string;
  caseId: string;
  proceedingId: string | null;
  title: string;
  eventDate: string;
  notes: string;
}
export interface RecordInput {
  id: string;
  caseId: string;
  body: string;
}
export interface BackupInfo {
  directory: string;
  createdAt: string;
  caseCount: number;
  fileCount: number;
}
export interface Reminder {
  eventId: string;
  title: string;
  scheduleKey: string;
  when: string;
}
export interface ImportReport {
  imported: number;
  errors: string[];
}
export interface Commands {
  create_material_folder: { args: { target: MaterialTarget; name: string }; result: string };
  rename_material: { args: { id: string; name: string }; result: null };
  update_material_notes: { args: { id: string; notes: string }; result: null };
  move_material: { args: { id: string; target: MaterialTarget }; result: null };
  pick_materials: { args: { target: MaterialTarget }; result: ImportReport };
  import_material_paths: {
    args: { target: MaterialTarget; paths: string[] };
    result: ImportReport;
  };
  material_preview: { args: { id: string }; result: string };
  open_material: { args: { id: string }; result: null };
  export_material: { args: { id: string }; result: boolean };
  save_contact: { args: { input: Contact; courtIds?: string[] }; result: null };
  set_proceeding_contacts: {
    args: { input: { proceedingId: string; courtId: string | null; judgeId: string | null } };
    result: null;
  };
  save_contact_link: { args: { input: ContactLink }; result: null };
  delete_contact: { args: { id: string }; result: null };
  delete_contact_link: { args: { id: string }; result: null };
  save_ledger: { args: { input: LedgerEntry }; result: null };
  pick_receipt_file: { args: Record<string, never>; result: string | null };
  save_ledger_with_receipt: {
    args: { input: LedgerEntry; sourcePath: string; receiptId: string };
    result: null;
  };
  delete_ledger: { args: { id: string }; result: null };
  save_case_detail: { args: { input: CaseDetail }; result: null };
  save_stage: { args: { input: Stage }; result: null };
  reorder_stages: { args: { proceedingId: string; ids: string[] }; result: null };
  delete_stage: { args: { id: string }; result: null };
  save_case_event: { args: { input: CaseEvent }; result: null };
  save_record: { args: { input: RecordInput }; result: null };
  trash_item: { args: { kind: 'case' | 'record' | 'material'; id: string }; result: null };
  restore_item: { args: { kind: 'case' | 'record' | 'material'; id: string }; result: null };
  purge_item: {
    args: { kind: 'case' | 'record' | 'material'; id: string; confirmed: boolean };
    result: null;
  };
  save_case_status: { args: { input: CaseStatus }; result: null };
  delete_case_status: { args: { id: string }; result: null };
  get_settings: { args: Record<string, never>; result: Record<string, string> };
  set_setting: { args: { key: string; value: string }; result: null };
  background_status: { args: Record<string, never>; result: Record<string, string> };
  due_reminders: { args: Record<string, never>; result: Reminder[] };
  acknowledge_reminder: { args: { eventId: string; key: string }; result: null };
  choose_backup_directory: { args: Record<string, never>; result: string | null };
  run_backup: { args: Record<string, never>; result: BackupInfo };
  pick_restore_backup: { args: Record<string, never>; result: BackupInfo | null };
  apply_restore_backup: { args: { path: string; confirmed: boolean }; result: BackupInfo };
  quit_app: { args: Record<string, never>; result: null };
  autostart_status: { args: Record<string, never>; result: boolean };
  set_autostart: { args: { enabled: boolean }; result: null };
  check_update: {
    args: Record<string, never>;
    result: { version: string; notes: string | null } | null;
  };
  install_update: { args: { confirmed: boolean }; result: null };
}
