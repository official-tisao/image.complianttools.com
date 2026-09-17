export function connectedComponents(
  binaryMaskOrImage:
    | Uint8ClampedArray
    | { width: number; height: number; frames: Array<{ data: Uint8ClampedArray }> },
  width?: number,
  height?: number,
): Array<{ label: number; area: number; bbox: { x: number; y: number; w: number; h: number } }> {
  let mask: Uint8ClampedArray;
  let w: number;
  let h: number;
  if (binaryMaskOrImage instanceof Uint8ClampedArray) {
    mask = binaryMaskOrImage;
    w = width!;
    h = height!;
  } else {
    const img = binaryMaskOrImage as {
      width: number;
      height: number;
      frames: Array<{ data: Uint8ClampedArray }>;
    };
    w = img.width;
    h = img.height;
    mask = img.frames[0]!.data;
  }
  const labels = new Int32Array(w * h).fill(-1);
  let nextLabel = 1;
  const components: Array<{
    label: number;
    area: number;
    bbox: { x: number; y: number; w: number; h: number };
  }> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (mask[idx] === 255 && labels[idx] === -1) {
        const stack = [{ x, y }];
        let area = 0;
        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        labels[idx] = nextLabel;
        while (stack.length > 0) {
          const cur = stack.pop()!;
          area += 1;
          minX = Math.min(minX, cur.x);
          maxX = Math.max(maxX, cur.x);
          minY = Math.min(minY, cur.y);
          maxY = Math.max(maxY, cur.y);
          const cx = cur.x;
          const cy = cur.y;
          const neighbors = [
            { x: cx - 1, y: cy },
            { x: cx + 1, y: cy },
            { x: cx, y: cy - 1 },
            { x: cx, y: cy + 1 },
          ];
          for (const n of neighbors) {
            if (n.x >= 0 && n.x < w && n.y >= 0 && n.y < h) {
              const nIdx = n.y * w + n.x;
              if (mask[nIdx] === 255 && labels[nIdx] === -1) {
                labels[nIdx] = nextLabel;
                stack.push({ x: n.x, y: n.y });
              }
            }
          }
        }
        components.push({
          label: nextLabel,
          area,
          bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        });
        nextLabel += 1;
      }
    }
  }
  return components;
}
