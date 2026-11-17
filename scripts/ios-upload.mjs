/** altool can exit zero after reporting a server-side validation failure. */
export function requireSuccessfulIosUpload(result) {
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (
    result.error ||
    result.status !== 0 ||
    !/UPLOAD SUCCEEDED/i.test(log) ||
    /UPLOAD FAILED|Failed to upload package|Validation failed/i.test(log)
  )
    throw new Error('Apple did not confirm a successful iOS upload');
}
