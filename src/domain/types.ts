export type CaseType = 'civil' | 'other';
export type ProgramKind = 'first_instance' | 'appeal' | 'retrial' | 'enforcement';
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
  id: string;
  caseId: string;
  kind: ProgramKind;
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
  statuses: CaseStatus[];
  cases: CaseFile[];
  proceedings: Proceeding[];
  tasks: Task[];
  workRecords: WorkRecord[];
  calendarEvents: CalendarEvent[];
  materials: Material[];
  contacts: Contact[];
  contactLinks: ContactLink[];
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
  id: string;
  title: string;
  caseType: CaseType;
  statusId: string;
}
export type ProceedingInput = Omit<Proceeding, 'caseId' | 'kind'>;
export interface Commands {
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
  add_proceeding: { args: { caseId: string; kind: ProgramKind }; result: string };
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
  statuses: [],
  cases: [],
  proceedings: [],
  tasks: [],
  workRecords: [],
  calendarEvents: [],
  materials: [],
  contacts: [],
  contactLinks: [],
  ledgerEntries: [],
  caseDetails: [],
  stages: [],
  caseEvents: [],
  deletedRecords: [],
};

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
  save_contact: { args: { input: Contact }; result: null };
  save_contact_link: { args: { input: ContactLink }; result: null };
  delete_contact: { args: { id: string }; result: null };
  delete_contact_link: { args: { id: string }; result: null };
  save_ledger: { args: { input: LedgerEntry }; result: null };
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
