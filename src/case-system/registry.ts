import type { Workspace } from '../domain/types';
import type {
  DocumentEditorProvider,
  DocumentTemplateProvider,
  CasePlanProvider,
  TimelineEntry,
} from './contracts';
import { resourceKey } from './contracts';
import { resourceIndex, type CaseResource } from './resources';
import type { CaseObject } from './objects';

export type TimelineDraft = Omit<
  TimelineEntry,
  'id' | 'caseId' | 'importance' | 'tags' | 'related'
> & { related?: TimelineEntry['related'] };
export interface CaseModule {
  id: string;
  timelineTypes: readonly { id: string; label: string }[];
  timeline?(data: Workspace, caseId: string): TimelineDraft[];
  resources?(data: Workspace, caseId: string): CaseResource[];
  documentEditor?: DocumentEditorProvider;
  templates?: DocumentTemplateProvider;
  plan?: CasePlanProvider;
}

/** Pure projection boundary. Modules register sources; the engine never edits their bodies. */
export class CaseSystem {
  private readonly modules = new Map<string, CaseModule>();
  register(module: CaseModule): this {
    if (this.modules.has(module.id)) throw new Error(`Duplicate case module: ${module.id}`);
    const known = new Set(this.types().map((t) => t.id));
    for (const type of module.timelineTypes) {
      if (known.has(type.id)) throw new Error(`Duplicate timeline type: ${type.id}`);
      known.add(type.id);
    }
    this.modules.set(module.id, module);
    return this;
  }
  types() {
    return [...this.modules.values()].flatMap((m) => m.timelineTypes);
  }
  extensions() {
    return [...this.modules.values()].map((m) => ({
      id: m.id,
      documentEditor: m.documentEditor,
      templates: m.templates,
      plan: m.plan,
    }));
  }
  objects(data: Workspace, caseId: string): CaseObject[] {
    const timeline = new Map(this.timeline(data, caseId).map((e) => [resourceKey(e.resource), e]));
    const metadata = new Map(
      data.resourceMetadata
        .filter((m) => m.caseId === caseId)
        .map((m) => [resourceKey(m.resource), m]),
    );
    const links = new Map<string, ReturnType<CaseSystem['relations']>>();
    for (const relation of this.relations(data, caseId))
      for (const ref of [relation.source, relation.target]) {
        const key = resourceKey(ref);
        if (!links.has(key)) links.set(key, []);
        links.get(key)!.push(relation);
      }
    return [...this.resources(data, caseId).values()].map((r) => {
      const id = resourceKey(r.reference),
        entry = timeline.get(id),
        meta = metadata.get(id);
      return {
        id,
        caseId,
        resource: r.reference,
        type: entry?.type ?? r.reference.kind,
        title: r.title,
        importance: meta?.importance ?? 'normal',
        tags: meta?.tags ?? [],
        properties: meta?.properties ?? [],
        businessTime: entry ? { value: entry.date, role: entry.dateRole } : null,
        relations: links.get(id) ?? [],
      };
    });
  }
  resources(data: Workspace, caseId: string, includeDirectory = false) {
    const result = resourceIndex(data, caseId, includeDirectory);
    for (const module of this.modules.values())
      for (const resource of module.resources?.(data, caseId) ?? []) {
        const key = resourceKey(resource.reference);
        if (result.has(key)) throw new Error(`Duplicate case resource: ${key}`);
        result.set(key, resource);
      }
    return result;
  }
  relations(data: Workspace, caseId: string) {
    const result = [...data.resourceRelations.filter((r) => r.caseId === caseId)];
    for (const link of data.workLinks.filter((l) => l.caseId === caseId)) {
      if (
        !result.some(
          (r) =>
            r.kind === 'in_node' &&
            r.source.kind === link.kind &&
            r.source.id === link.resourceId &&
            r.target.kind === 'proceeding' &&
            r.target.id === link.proceedingId,
        )
      )
        result.push({
          id: `legacy:${link.id}`,
          caseId,
          source: { kind: link.kind, id: link.resourceId },
          target: { kind: 'proceeding', id: link.proceedingId },
          kind: 'in_node',
          label: link.label,
        });
    }
    for (const event of data.caseEvents.filter((e) => e.caseId === caseId && e.proceedingId))
      result.push({
        id: `legacy:milestone:${event.id}`,
        caseId,
        source: { kind: 'milestone', id: event.id },
        target: { kind: 'proceeding', id: event.proceedingId! },
        kind: 'in_node',
        label: '',
      });
    return result;
  }
  timeline(data: Workspace, caseId: string): TimelineEntry[] {
    if (!data.cases.some((c) => c.id === caseId && !c.deletedAt)) return [];
    const resources = this.resources(data, caseId);
    const metadata = new Map(
      data.resourceMetadata
        .filter((m) => m.caseId === caseId)
        .map((m) => [resourceKey(m.resource), m]),
    );
    const relations = this.relations(data, caseId).filter(
      (r) =>
        r.caseId === caseId &&
        resources.has(resourceKey(r.source)) &&
        resources.has(resourceKey(r.target)),
    );
    const adjacent = new Map<string, Map<string, TimelineEntry['resource']>>();
    for (const relation of relations)
      for (const [from, to] of [
        [relation.source, relation.target],
        [relation.target, relation.source],
      ]) {
        const key = resourceKey(from);
        if (!adjacent.has(key)) adjacent.set(key, new Map());
        adjacent.get(key)!.set(resourceKey(to), to);
      }
    const entries = new Map<string, TimelineEntry>();
    for (const module of this.modules.values())
      for (const draft of module.timeline?.(data, caseId) ?? []) {
        const id = resourceKey(draft.resource);
        if (entries.has(id)) throw new Error(`Duplicate timeline resource: ${id}`);
        if (!module.timelineTypes.some((t) => t.id === draft.type))
          throw new Error(`Unregistered timeline type: ${draft.type}`);
        const meta = metadata.get(id);
        const related = new Map(
          (draft.related ?? [])
            .filter((r) => resources.has(resourceKey(r)))
            .map((r) => [resourceKey(r), r]),
        );
        for (const [key, ref] of adjacent.get(id) ?? []) related.set(key, ref);
        entries.set(id, {
          ...draft,
          id,
          caseId,
          importance: meta?.importance ?? 'normal',
          tags: meta?.tags ?? [],
          related: [...related.values()],
        });
      }
    return [...entries.values()].sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id),
    );
  }
}
