export async function verifyWasmIntegrity(
  bytes: ArrayBuffer,
  expectedSha256: string,
): Promise<ArrayBuffer> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (actual !== expectedSha256) {
    throw new Error(`WASM integrity check failed: expected ${expectedSha256}, got ${actual}.`);
  }
  return bytes;
}
