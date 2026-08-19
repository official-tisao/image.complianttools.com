export type SynthesizedProfile = 'srgb' | 'display-p3' | 'adobe-rgb-compatible' | 'gray';

type Chromaticities = {
  readonly red: readonly [number, number, number];
  readonly green: readonly [number, number, number];
  readonly blue: readonly [number, number, number];
  readonly gamma: number;
};

const profiles: Record<Exclude<SynthesizedProfile, 'gray'>, Chromaticities> = {
  srgb: {
    red: [0.4361, 0.2225, 0.0139],
    green: [0.3851, 0.7169, 0.0971],
    blue: [0.1431, 0.0606, 0.7141],
    gamma: 2.2,
  },
  'display-p3': {
    red: [0.5151, 0.2412, -0.0011],
    green: [0.2919, 0.6922, 0.0419],
    blue: [0.1571, 0.0666, 0.7841],
    gamma: 2.2,
  },
  'adobe-rgb-compatible': {
    red: [0.6097, 0.3111, 0.0195],
    green: [0.2052, 0.6257, 0.0609],
    blue: [0.1492, 0.0632, 0.7448],
    gamma: 2.1992,
  },
};

function signature(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function fixed(value: number): number {
  return Math.round(value * 65536);
}

function put32(output: Uint8Array, offset: number, value: number): void {
  new DataView(output.buffer).setUint32(offset, value >>> 0);
}

function putS15Fixed16(output: Uint8Array, offset: number, value: number): void {
  new DataView(output.buffer).setInt32(offset, fixed(value));
}

function tag(signatureName: string, body: Uint8Array): { signature: string; body: Uint8Array } {
  return { signature: signatureName, body };
}

function xyz(x: number, y: number, z: number): Uint8Array {
  const output = new Uint8Array(20);
  output.set(signature('XYZ '));
  putS15Fixed16(output, 8, x);
  putS15Fixed16(output, 12, y);
  putS15Fixed16(output, 16, z);
  return output;
}

function curve(gamma: number): Uint8Array {
  const output = new Uint8Array(14);
  output.set(signature('curv'));
  put32(output, 8, 1);
  new DataView(output.buffer).setUint16(12, Math.round(gamma * 256));
  return output;
}

/** Creates a self-contained ICC v4 matrix/TRC profile from published colour primaries. */
export function synthesizeIccProfile(kind: SynthesizedProfile): Uint8Array {
  const definition = kind === 'gray' ? undefined : profiles[kind];
  const tags = definition
    ? [
        tag('rXYZ', xyz(...definition.red)),
        tag('gXYZ', xyz(...definition.green)),
        tag('bXYZ', xyz(...definition.blue)),
        tag('wtpt', xyz(0.9642, 1, 0.8249)),
        tag('rTRC', curve(definition.gamma)),
        tag('gTRC', curve(definition.gamma)),
        tag('bTRC', curve(definition.gamma)),
      ]
    : [tag('wtpt', xyz(0.9642, 1, 0.8249)), tag('kTRC', curve(2.2))];
  const tableSize = 132 + tags.length * 12;
  const size = tableSize + tags.reduce((total, item) => total + item.body.length, 0);
  const output = new Uint8Array(size);
  put32(output, 0, size);
  output.set(signature('mntr'), 12);
  output.set(signature(definition ? 'RGB ' : 'GRAY'), 16);
  output.set(signature('XYZ '), 20);
  put32(output, 8, 0x04300000);
  output.set(signature('acsp'), 36);
  putS15Fixed16(output, 68, 0.9642);
  putS15Fixed16(output, 72, 1);
  putS15Fixed16(output, 76, 0.8249);
  output.set(signature('CTLS'), 80);
  put32(output, 128, tags.length);
  let offset = tableSize;
  tags.forEach((item, index) => {
    const entry = 132 + index * 12;
    output.set(signature(item.signature), entry);
    put32(output, entry + 4, offset);
    put32(output, entry + 8, item.body.length);
    output.set(item.body, offset);
    offset += item.body.length;
  });
  return output;
}

/** Original embedded profiles are never transformed unless the caller explicitly asks to replace them. */
export function resolveIccProfile(
  embedded: Uint8Array | undefined,
  policy: 'preserve' | 'strip' | 'synthesize',
  kind: SynthesizedProfile = 'srgb',
): Uint8Array | undefined {
  if (policy === 'strip') return undefined;
  if (policy === 'preserve' && embedded) return embedded;
  return synthesizeIccProfile(kind);
}
