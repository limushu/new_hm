import type { ComponentType } from 'react';
import type { SaveAction, Workspace } from '../domain/types';
import type { ResourceRef } from './contracts';
export interface ResourceDetailsProps {
  resource: ResourceRef;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onOpen?: (resource: ResourceRef) => void;
  onExpand?: () => void;
}
export interface ResourcePresentation {
  content?: ComponentType<ResourceDetailsProps>;
  editor?: ComponentType<ResourceDetailsProps>;
  expanded?: ComponentType<ResourceDetailsProps>;
}
/** UI adapters register separately from resource storage and timeline projection. */
export class CasePresentations {
  private readonly details = new Map<string, ResourcePresentation>();
  register(kind: string, presentation: ResourcePresentation): this {
    if (this.details.has(kind)) throw new Error(`Duplicate case presentation: ${kind}`);
    this.details.set(kind, presentation);
    return this;
  }
  get(kind: string) {
    return this.details.get(kind);
  }
}
