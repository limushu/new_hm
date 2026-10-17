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
};
