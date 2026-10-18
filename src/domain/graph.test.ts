import { describe, expect, it } from 'vitest';
import { graphLayout, graphSlice, graphLabels, type Graph } from './graph';

const graph: Graph = {
  nodes: ['a', 'b', 'c', 'isolated'].map((id) => ({
    id,
    entityId: id,
    label: id,
    meta: '',
    kind: id === 'b' ? 'court' : 'case',
  })),
  edges: [
    { source: 'b', target: 'c', label: '法院' },
    { source: 'a', target: 'b', label: '关联' },
    { source: 'b', target: 'a', label: '委托人' },
    { source: 'c', target: 'missing', label: '无效' },
  ],
};
describe('关系图范围与布局', () => {
  it('名称避让优先保留选中对象，密集节点不会迫使所有名称堆在同一处', () => {
    const nodes = graph.nodes.map((n) => ({ ...n, label: '较长的示例对象名称' }));
    const positions = new Map(nodes.map((n, i) => [n.id, { x: 100 + i * 9, y: 100 }]));
    const labels = graphLabels(nodes, positions, 'c');
    expect(labels.has('c')).toBe(true);
    expect(labels.size).toBeLessThan(nodes.length);
    expect(positions.get('c')).toEqual({ x: 118, y: 100 });
  });
  it('按真正的邻接层级展开，与边的顺序无关，合并同一对象间的身份', () => {
    expect(graphSlice(graph, 'a', 1, false, '', new Set()).nodes.map((n) => n.id)).toEqual([
      'a',
      'b',
    ]);
    const local = graphSlice(graph, 'a', 2, false, '', new Set());
    expect(local.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(local.edges).toHaveLength(2);
    expect(local.edges[1].label).toBe('关联 / 委托人');
    expect(graph.edges[1].label).toBe('关联');
  });
  it('全局包含孤立节点，搜索与类型筛选移除悬空连线，限量明确统计', () => {
    expect(graphSlice(graph, 'a', 1, true, '', new Set()).nodes).toHaveLength(4);
    expect(graphSlice(graph, 'a', 1, true, 'isolated', new Set()).edges).toHaveLength(0);
    expect(graphSlice(graph, 'a', 2, false, '', new Set(['court'])).edges).toHaveLength(0);
    const capped = graphSlice(graph, 'a', 1, true, '', new Set(), 2);
    expect(capped.nodes).toHaveLength(2);
    expect(capped.total).toBe(4);
  });
  it('空图、单点与窄屏布局有限且可复现，布局不改写原图', () => {
    expect(graphLayout({ nodes: [], edges: [] }, 300, 340).size).toBe(0);
    const input = graphSlice(graph, 'a', 3, true, '', new Set());
    const layout = graphLayout(input, 300, 340);
    expect([...layout]).toEqual([...graphLayout(input, 300, 340)]);
    for (const p of layout.values()) {
      expect(Number.isFinite(p.x + p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(74);
      expect(p.x).toBeLessThanOrEqual(226);
      expect(p.y).toBeGreaterThanOrEqual(44);
      expect(p.y).toBeLessThanOrEqual(296);
    }
  });
});
