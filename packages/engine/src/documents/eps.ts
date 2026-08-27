export type EpsDecodeResult =
  | {
      readonly kind: 'preview';
      readonly mimeType: 'image/tiff' | 'image/wmf';
      readonly bytes: Uint8Array;
    }
  | { readonly kind: 'svg'; readonly svg: string; readonly width: number; readonly height: number };

const binaryEpsMagic = [0xc5, 0xd0, 0xd3, 0xc6] as const;

function extractBinaryPreview(bytes: Uint8Array): EpsDecodeResult | undefined {
  if (!binaryEpsMagic.every((value, index) => bytes[index] === value)) return undefined;
  if (bytes.length < 30) throw new Error('Binary EPS header is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const range = (offsetAt: number, lengthAt: number, label: string) => {
    const offset = view.getUint32(offsetAt, true);
    const length = view.getUint32(lengthAt, true);
    if (length === 0) return undefined;
    if (offset < 30 || offset > bytes.length - length)
      throw new Error(`Binary EPS ${label} preview points outside the file.`);
    return bytes.slice(offset, offset + length);
  };
  const tiff = range(20, 24, 'TIFF');
  if (tiff) return { kind: 'preview', mimeType: 'image/tiff', bytes: tiff };
  const wmf = range(12, 16, 'WMF');
  if (wmf) return { kind: 'preview', mimeType: 'image/wmf', bytes: wmf };
  const postscriptOffset = view.getUint32(4, true);
  const postscriptLength = view.getUint32(8, true);
  if (postscriptOffset < 30 || postscriptOffset > bytes.length - postscriptLength)
    throw new Error('Binary EPS PostScript section points outside the file.');
  return interpretPostScriptSubset(
    bytes.slice(postscriptOffset, postscriptOffset + postscriptLength),
  );
}

type Matrix = readonly [number, number, number, number, number, number];
type GraphicsState = { matrix: Matrix; color: string; lineWidth: number };

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function interpretPostScriptSubset(input: Uint8Array): EpsDecodeResult {
  const source = new TextDecoder('latin1').decode(input);
  if (!/^%!PS-Adobe-[^\r\n]*EPSF-/u.test(source))
    throw new Error('PostScript is not an EPSF document with a bounded preview contract.');
  const bounding =
    /^%%BoundingBox:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/mu.exec(
      source,
    );
  if (!bounding) throw new Error('EPS requires a numeric %%BoundingBox.');
  const [left, bottom, right, top] = bounding.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const width = right - left;
  const height = top - bottom;
  if (!(width > 0 && height > 0 && width * height <= 100_000_000))
    throw new Error('EPS bounding box exceeds the safe render limit.');

  const program = source
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith('%'))
    .join('\n');
  const tokens = program.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[^\s]+/gu) ?? [];
  const numbers: number[] = [];
  const elements: string[] = [];
  const stack: GraphicsState[] = [];
  let state: GraphicsState = { matrix: [1, 0, 0, 1, 0, 0], color: 'rgb(0 0 0)', lineWidth: 1 };
  let path = '';
  const take = (count: number, operator: string) => {
    if (numbers.length < count) throw new Error(`EPS ${operator} has too few numeric operands.`);
    return numbers.splice(numbers.length - count, count);
  };
  const point = (x: number, y: number) => {
    const matrix = state.matrix;
    const tx = matrix[0] * x + matrix[2] * y + matrix[4];
    const ty = matrix[1] * x + matrix[3] * y + matrix[5];
    return [tx - left, top - ty] as const;
  };
  const paint = (fill: boolean) => {
    if (!path) throw new Error(`EPS ${fill ? 'fill' : 'stroke'} has no current path.`);
    elements.push(
      fill
        ? `<path d="${path.trim()}" fill="${state.color}"/>`
        : `<path d="${path.trim()}" fill="none" stroke="${state.color}" stroke-width="${state.lineWidth}"/>`,
    );
    path = '';
  };
  for (const token of tokens) {
    const numeric = Number(token);
    if (Number.isFinite(numeric)) {
      numbers.push(numeric);
      continue;
    }
    if (token === 'newpath') path = '';
    else if (token === 'moveto' || token === 'lineto') {
      const [x, y] = take(2, token) as [number, number];
      const [tx, ty] = point(x, y);
      path += `${token === 'moveto' ? 'M' : 'L'}${tx} ${ty} `;
    } else if (token === 'curveto') {
      const values = take(6, token);
      const points = [
        point(values[0]!, values[1]!),
        point(values[2]!, values[3]!),
        point(values[4]!, values[5]!),
      ];
      path += `C${points.map(([x, y]) => `${x} ${y}`).join(' ')} `;
    } else if (token === 'closepath') path += 'Z ';
    else if (token === 'stroke') paint(false);
    else if (token === 'fill') paint(true);
    else if (token === 'setlinewidth') state = { ...state, lineWidth: take(1, token)[0]! };
    else if (token === 'setgray') {
      const value = Math.round(Math.max(0, Math.min(1, take(1, token)[0]!)) * 255);
      state = { ...state, color: `rgb(${value} ${value} ${value})` };
    } else if (token === 'setrgbcolor') {
      const values = take(3, token).map((value) =>
        Math.round(Math.max(0, Math.min(1, value)) * 255),
      );
      state = { ...state, color: `rgb(${values.join(' ')})` };
    } else if (token === 'translate') {
      const [x, y] = take(2, token) as [number, number];
      state = { ...state, matrix: multiply(state.matrix, [1, 0, 0, 1, x, y]) };
    } else if (token === 'scale') {
      const [x, y] = take(2, token) as [number, number];
      state = { ...state, matrix: multiply(state.matrix, [x, 0, 0, y, 0, 0]) };
    } else if (token === 'rotate') {
      const radians = (take(1, token)[0]! * Math.PI) / 180;
      state = {
        ...state,
        matrix: multiply(state.matrix, [
          Math.cos(radians),
          Math.sin(radians),
          -Math.sin(radians),
          Math.cos(radians),
          0,
          0,
        ]),
      };
    } else if (token === 'gsave') stack.push({ ...state, matrix: [...state.matrix] as Matrix });
    else if (token === 'grestore') {
      const restored = stack.pop();
      if (!restored) throw new Error('EPS grestore has no matching gsave.');
      state = restored;
    } else if (token !== 'showpage') {
      throw new Error(`EPS operator "${token}" is outside the supported path subset.`);
    }
    if (numbers.length > 64) throw new Error('EPS operand stack exceeds the safe subset limit.');
  }
  if (numbers.length !== 0) throw new Error('EPS leaves unused operands on the stack.');
  if (stack.length !== 0) throw new Error('EPS has an unterminated gsave block.');
  if (path) throw new Error('EPS has an unpainted path; partial rendering was refused.');
  if (elements.length === 0) throw new Error('EPS contains no supported painted paths.');
  return {
    kind: 'svg',
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${elements.join('')}</svg>`,
  };
}

/** Extracts an EPS binary preview, or interprets the strict documented path subset. */
export function decodeEps(input: ArrayBuffer | Uint8Array): EpsDecodeResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return extractBinaryPreview(bytes) ?? interpretPostScriptSubset(bytes);
}
