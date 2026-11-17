import type { BackupSummary } from './types';
export interface CloudWorkspace {
  id: string;
  label: string;
}
export interface SyncConflict {
  token: string;
  local: BackupSummary;
  remote: BackupSummary;
}
export interface SyncStatus {
  installed: boolean;
  configured: boolean;
  enabled: boolean;
  phase: string;
  errorCode: string | null;
  lastSuccessAt: string | null;
  workspaceLabel: string | null;
  conflict: SyncConflict | null;
  incoming: { token: string; summary: BackupSummary } | null;
}
