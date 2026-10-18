import { describe, it, expect } from 'vitest';
import { workflowLayout } from './workflow-layout';
import type { Proceeding } from './types';
const node = (id: string, parentId: string | null): Proceeding => ({
  id,
  parentId,
  caseId: 'case',
  kind: 'custom',
  name: id,
  category: 'non_litigation',
  stage: '',
  state: 'active',
  completedAt: null,
  caseNumber: '',
  court: '',
  judge: '',
});
describe('workflow forest layout', () => {
  it('keeps branches attached to their predecessor regardless of creation order', () => {
    const { nodes } = workflowLayout([
      node('appeal', 'first'),
      node('independent', null),
      node('first', null),
      node('execution', 'first'),
    ]);
    const first = nodes.find((n) => n.program.id === 'first')!;
    const a = nodes.find((n) => n.program.id === 'appeal')!;
    const e = nodes.find((n) => n.program.id === 'execution')!;
    expect(a.x).toBeGreaterThan(first.x);
    expect(a.x).toBe(e.x);
    expect(a.y).not.toBe(e.y);
    expect(first.y).toBe((a.y + e.y) / 2);
    expect(nodes.find((n) => n.program.id === 'independent')!.x).toBe(0);
  });
  it('does not recurse forever if damaged input contains a cycle', () => {
    expect(workflowLayout([node('a', 'b'), node('b', 'a')]).nodes).toHaveLength(2);
    expect(workflowLayout([]).height).toBe(0);
  });
});
