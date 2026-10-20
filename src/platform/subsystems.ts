export type Capability =
  | 'tray'
  | 'autostart'
  | 'window-theme'
  | 'native-drop'
  | 'signed-updates'
  | 'background-maintenance'
  | 'foreground-maintenance'
  | 'file-picker'
  | 'file-export'
  | 'external-open'
  | 'record-audio'
  | 'local-backup'
  | 'backup-transfer'
  | 'system-notifications';

export interface RuntimeManifest {
  version: 1;
  subsystems: Array<{
    id: 'host' | 'updates' | 'maintenance' | 'documents' | 'recording' | 'backup';
    state: 'ready' | 'unsupported';
    capabilities: Capability[];
  }>;
}

/** Capabilities are provided by the installed adapter, never inferred from screen width. */
export function supports(manifest: RuntimeManifest | null, capability: Capability): boolean {
  return (
    manifest?.version === 1 &&
    manifest.subsystems.some(
      (subsystem) => subsystem.state === 'ready' && subsystem.capabilities.includes(capability),
    )
  );
}
