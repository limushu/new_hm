import type { Workspace } from '../domain/types';
import type {
  DocumentEditorProvider,
  DocumentTemplateProvider,
  CasePlanProvider,
  TimelineEntry,
} from './contracts';
import { resourceKey } from './contracts';
import { resourceIndex, type CaseResource } from './resources';

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
  timeline(data: Workspace, caseId: string): TimelineEntry[] {
    if (!data.cases.some((c) => c.id === caseId && !c.deletedAt)) return [];
    const resources = this.resources(data, caseId);
    const metadata = new Map(
      data.resourceMetadata
        .filter((m) => m.caseId === caseId)
        .map((m) => [resourceKey(m.resource), m]),
    );
    const relations = data.resourceRelations.filter(
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
