import { Users, ArrowUpRight } from 'lucide-react';
import type { CaseFile, Workspace, SaveAction } from '../../domain/types';
import { currentStage, proceedingName } from '../../domain/proceedings';
import CaseTimeline from './CaseTimeline';
export default function CaseChronicle({
  item,
  data,
  save,
  onProgram,
  onPeople,
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
  onProgram: (id: string) => void;
  onPeople: () => void;
}) {
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const focus =
    programs.find((p) => p.id === item.currentProceedingId) ??
    programs.find((p) => p.state === 'active');
  return (
    <div className="case-chronicle">
      <header className="chronicle-context">
        <div>
          <span className="chronicle-eyebrow">当前办理</span>
          {focus ? (
            <button
              className="timeline-current-program"
              aria-label="查看当前办理流程"
              onClick={() => onProgram(focus.id)}
            >
              {proceedingName(focus, programs)} ·{' '}
              {focus.state === 'completed' ? '已办结' : currentStage(data, focus)}
              <ArrowUpRight />
            </button>
          ) : (
            <h2>尚未指定办理流程</h2>
          )}
        </div>
        <button className="chronicle-people-link" onClick={onPeople}>
          <Users />
          相关人
        </button>
      </header>
      <CaseTimeline caseId={item.id} data={data} save={save} />
    </div>
  );
}
