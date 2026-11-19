import type { CaseHeader, CaseInput } from './types';

/** Serialize UI edits against durable receipts. Failed edits never become the
 * baseline of a later write, and an unrelated edit never commits a title draft. */
export function createCaseHeaderQueue(
  initial: CaseInput,
  write: (input: CaseInput) => Promise<CaseHeader>,
) {
  const inputOnly = ({ id, title, caseType, statusId, tags }: CaseInput): CaseInput => ({
    id,
    title,
    caseType,
    statusId,
    tags,
  });
  let confirmed = inputOnly(initial);
  let pending = 0;
  let tail: Promise<boolean> = Promise.resolve(true);
  return {
    snapshot: () => confirmed,
    rebase(input: CaseInput) {
      if (!pending) confirmed = inputOnly(input);
    },
    settled: () => tail,
    enqueue(patch: Partial<CaseInput>) {
      pending++;
      const operation = tail.then(async () => {
        const receipt = await write({ ...confirmed, ...patch, id: confirmed.id });
        confirmed = inputOnly({ ...receipt.item, tags: receipt.tags.map((tag) => tag.tag) });
        return receipt;
      });
      tail = operation.then(
        () => {
          pending--;
          return true;
        },
        () => {
          pending--;
          return false;
        },
      );
      return operation;
    },
  };
}
