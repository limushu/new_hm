import type { WorkLink, WorkScope, Workspace } from './types';
import { proceedingName } from './proceedings';
export const caseScope: WorkScope = { proceedingId: null, stageId: null };
export function scopeName(data: Workspace, scope: WorkScope) {
  if (scope.proceedingId === 'shared') return '案件共用';
  const p = data.proceedings.find((p) => p.id === scope.proceedingId);
  const stage = data.stages.find((s) => s.id === scope.stageId);
  return p
    ? [proceedingName(p, data.proceedings), stage?.name].filter(Boolean).join(' · ')
    : '全案';
}
export function matchesScope(link: WorkScope, scope: WorkScope) {
  return (
    (!scope.proceedingId || link.proceedingId === scope.proceedingId) &&
    (!scope.stageId || link.stageId === scope.stageId)
  );
}
export function resourceLinks(data: Workspace, kind: WorkLink['kind'], id: string) {
  return data.workLinks.filter((l) => l.kind === kind && l.resourceId === id);
}
export function resourceInScope(
  data: Workspace,
  kind: WorkLink['kind'],
  id: string,
  scope: WorkScope,
) {
  return !scope.proceedingId || resourceLinks(data, kind, id).some((l) => matchesScope(l, scope));
}
export function stageSuggestions(name: string): string[] {
  if (/材料|资料|需求|委托/.test(name))
    return ['确认委托范围与办理目标', '核对事实与现有材料', '列出待补充资料'];
  if (/立案|申请/.test(name)) return ['核对提交材料与附件', '提交申请并保存回执', '跟进受理结果'];
  if (/举证|调查/.test(name))
    return ['整理证据目录', '核对证据原件与提交稿', '确认提交日期并保存回执'];
  if (/开庭|庭审/.test(name)) return ['准备庭审提纲', '确认出庭安排', '整理庭审记录'];
  if (/交付|裁判|结果/.test(name))
    return ['核对成果与收件记录', '向委托人反馈结果', '核对后续事项与收费安排'];
  return ['明确本阶段的工作目标', '准备相关资料', '记录处理结果与后续事项'];
}
