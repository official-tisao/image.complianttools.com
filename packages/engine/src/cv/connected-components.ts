export function connectedComponents(
  binaryMask: Uint8ClampedArray,
  width: number,
  height: number,
): Array<{ label: number; area: number; bbox: { x: number; y: number; w: number; h: number } }> {
  const labels = new Int32Array(width * height).fill(-1);
  let nextLabel = 1;
  const components: Array<{
    label: number;
    area: number;
    bbox: { x: number; y: number; w: number; h: number };
  }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (binaryMask[idx] === 255 && labels[idx] === -1) {
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
            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
              const nIdx = n.y * width + n.x;
              if (binaryMask[nIdx] === 255 && labels[nIdx] === -1) {
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
