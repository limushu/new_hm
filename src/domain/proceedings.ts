import { programLabels, type Proceeding, type Workspace } from './types';
export function proceedingName(p: Proceeding, all: Proceeding[]) {
  const name = p.name || programLabels[p.kind] || '办理流程';
  const siblings = all.filter(
    (x) => x.caseId === p.caseId && (x.name || programLabels[x.kind]) === name,
  );
  return name + (siblings.length > 1 ? ` · ${siblings.findIndex((x) => x.id === p.id) + 1}` : '');
}
export function currentStage(data: Workspace, p: Proceeding) {
  return (
    data.stages.find((s) => s.proceedingId === p.id && s.state === 'current')?.name ||
    p.stage ||
    '尚未设置阶段'
  );
}
