import type { Importance, ResourceRef, ResourceRelation, DateRole } from './contracts';
/** Common case-context identity. Bodies and type-specific rules belong to their modules. */
export interface CaseObject {
  id: string;
  caseId: string;
  resource: ResourceRef;
  type: string;
  title: string;
  importance: Importance;
  tags: string[];
  relations: ResourceRelation[];
  businessTime: { value: string | null; role: DateRole } | null;
}
export interface CreationProperties {
  importance: Importance;
  tags: string[];
  nodes: ResourceRef[];
}
export const defaultCreationProperties = (): CreationProperties => ({
  importance: 'normal',
  tags: [],
  nodes: [],
});
