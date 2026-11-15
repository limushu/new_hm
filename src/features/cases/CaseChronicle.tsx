import type { CaseFile, Workspace, SaveAction } from '../../domain/types';
import CaseTimeline from './CaseTimeline';
export default function CaseChronicle({
  item,
  data,
  save,
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
}) {
  return (
    <div className="case-chronicle">
      <CaseTimeline caseId={item.id} data={data} save={save} />
    </div>
  );
}
