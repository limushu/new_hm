import type { CaseHeader, Workspace } from './types';

/** Merge the native write receipt; retain unrelated collections and their identities. */
export function mergeCaseHeader(data: Workspace, header: CaseHeader): Workspace {
  const id = header.item.id;
  const previous = data.caseTags.filter((t) => t.caseId === id);
  const sameTags =
    previous.length === header.tags.length &&
    previous.every((t, index) => t.tag === header.tags[index].tag);
  return {
    ...data,
    cases: data.cases.some((c) => c.id === id)
      ? data.cases.map((c) => (c.id === id ? header.item : c))
      : [...data.cases, header.item],
    caseTags: sameTags
      ? data.caseTags
      : [...data.caseTags.filter((t) => t.caseId !== id), ...header.tags],
    tagCatalog:
      data.tagCatalog.length === header.tagCatalog.length &&
      data.tagCatalog.every((tag, index) => tag === header.tagCatalog[index])
        ? data.tagCatalog
        : header.tagCatalog,
  };
}
