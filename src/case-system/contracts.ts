/** Stable resource references. Owning modules retain bodies, amounts and editing rules. */
export interface ResourceRef {
  kind: string;
  id: string;
}
export type Importance = 'normal' | 'important';
export interface ResourceMetadata {
  caseId: string;
  resource: ResourceRef;
  importance: Importance;
  tags: string[];
}
export interface ResourceRelation {
  id: string;
  caseId: string;
  source: ResourceRef;
  target: ResourceRef;
  kind: string;
  label: string;
}
export type DateRole = 'occurred' | 'recorded' | 'archived' | 'scheduled' | 'due' | 'transaction';
export interface TimelineEntry {
  id: string;
  caseId: string;
  resource: ResourceRef;
  type: string;
  title: string;
  body: string;
  date: string | null;
  dateRole: DateRole;
  importance: Importance;
  tags: string[];
  related: ResourceRef[];
}
export interface TimelineFilter {
  importantOnly?: boolean;
  types?: string[];
  tags?: string[];
  relatedTo?: ResourceRef;
}
export const resourceKey = (ref: ResourceRef) => `${ref.kind}:${ref.id}`;
export const sameResource = (a: ResourceRef, b: ResourceRef) => a.kind === b.kind && a.id === b.id;

/** Advanced services are contracts; the module registry advertises only working providers. */
export interface DocumentDraft {
  resource: ResourceRef;
  revision: string;
  format: string;
  content: string;
}
export interface DocumentEditorProvider {
  id: string;
  formats: readonly string[];
  read(resource: ResourceRef): Promise<DocumentDraft>;
  /** Must reject stale base revisions and preserve any previously submitted version. */
  save(draft: DocumentDraft): Promise<DocumentDraft>;
}
export interface DocumentTemplateProvider {
  id: string;
  list(): Promise<{ id: string; name: string; revision: string; format: string }[]>;
  /** Missing fields stay explicit; producing a document must not mutate the template. */
  instantiate(input: {
    caseId: string;
    templateId: string;
    revision: string;
    fields: Record<string, string>;
  }): Promise<DocumentDraft>;
}
export interface CasePlanItem {
  resource: ResourceRef;
  startsOn: string | null;
  endsOn: string | null;
  certainty: 'confirmed' | 'estimated';
  dependsOn: ResourceRef[];
}
export interface CasePlanProvider {
  id: string;
  list(caseId: string): Promise<CasePlanItem[]>;
}
