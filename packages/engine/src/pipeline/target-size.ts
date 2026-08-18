export interface TargetSizeAttempt {
  quality: number;
  bytes: number;
  scale: number;
  iteration: number;
}
export interface TargetSizeResult {
  data: ArrayBuffer;
  quality: number;
  bytes: number;
  scale: number;
  attempts: readonly TargetSizeAttempt[];
  warning?: string;
}

export async function searchTargetSize(
  targetBytes: number,
  encode: (quality: number, scale: number) => Promise<ArrayBuffer>,
  options: {
    tolerance?: number;
    strategy?: 'quality' | 'quality-then-scale' | 'scale';
    signal?: AbortSignal;
    onAttempt?: (attempt: TargetSizeAttempt) => void;
  } = {},
): Promise<TargetSizeResult> {
  const tolerance = options.tolerance ?? 0.02;
  const strategy = options.strategy ?? 'quality';
  const attempts: TargetSizeAttempt[] = [];
  let closest: TargetSizeResult | undefined;
  let scale = 1;
  for (let outer = 0; outer < (strategy === 'quality' ? 1 : 3); outer += 1) {
    let low = 1;
    let high = 100;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      if (options.signal?.aborted)
        throw new DOMException('Target-size search cancelled.', 'AbortError');
      const quality = iteration === 0 ? 82 : Math.round((low + high) / 2);
      const data = await encode(quality, scale);
      const bytes = data.byteLength;
      const attempt = { quality, bytes, scale, iteration: outer * 8 + iteration };
      attempts.push(attempt);
      options.onAttempt?.(attempt);
      if (!closest || Math.abs(bytes - targetBytes) < Math.abs(closest.bytes - targetBytes))
        closest = { data, quality, bytes, scale, attempts };
      if (Math.abs(bytes - targetBytes) / targetBytes <= tolerance)
        return { data, quality, bytes, scale, attempts };
      if (bytes > targetBytes) high = quality - 1;
      else low = quality + 1;
      if (low > high) break;
    }
    if (strategy === 'scale') break;
    scale *= Math.min(0.98, Math.sqrt(targetBytes / Math.max(1, closest!.bytes)));
  }
  return {
    ...closest!,
    attempts,
    warning: `Closest result is ${closest!.bytes} bytes; ${targetBytes} bytes was impossible within ±${Math.round(tolerance * 100)}% using ${attempts.length} bounded attempts.`,
  };
}
