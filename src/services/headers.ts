/** HTTP headers must be ASCII; JSON unicode escapes keep recording names lossless. */
export function jsonHeader(value: unknown) {
  return JSON.stringify(value).replace(
    /[^ -~]/g,
    (c) => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
