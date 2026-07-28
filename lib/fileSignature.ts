/** Convert a Uint8Array to a lowercase hex string for logging. */
export function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate file magic bytes against known image/video signatures.
 * Accepts JPEG, PNG, GIF, WebP, AVIF, MP4/MOV, WebM, MKV, AVI, MKV.
 *
 * Shared between the single-shot upload route (app/api/ipfs/upload) and the
 * chunked-upload complete route (app/api/ipfs/upload/complete) — the check
 * only needs the file's leading bytes, so it applies to the first chunk /
 * whole small file identically once assembled.
 */
export function hasValidMagicBytes(header: Uint8Array): boolean {
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return true;
  // PNG: 89 50 4E 47
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  )
    return true;
  // GIF: 47 49 46 38
  if (
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38
  )
    return true;
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  )
    return true;
  // MP4/MOV/M4V ftyp box: bytes 4-7 = 66 74 79 70
  if (
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  )
    return true;
  // WebM/MKV: 1A 45 DF A3
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  )
    return true;
  // AVI: 52 49 46 46 ?? ?? ?? ?? 41 56 49 20
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x41 &&
    header[9] === 0x56 &&
    header[10] === 0x49
  )
    return true;
  return false;
}
