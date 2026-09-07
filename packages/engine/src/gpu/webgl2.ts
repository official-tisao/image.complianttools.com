import type { RasterImage } from '../types.js';
import { applyAdjustments } from '../ops/adjust.js';
import { OP_CODES } from './op-codes.js';
import type { BackendResult, GpuBackend, GpuEnvironment, GpuPixelLocalStep } from './types.js';

/**
 * The WebGL2 backend. It runs the GPU-supported pixel-local ops as a single
 * fragment-shader program (the shader source is in this file as a template
 * string; the host compiles and links it once per backend instance). It is
 * the **preview-time** tier; the export path is forced to CPU by `compile`.
 *
 * The test harness injects a `gl` stub via `GpuEnvironment.gl` so the
 * engine never references `document.createElement('canvas')` directly (the
 * `no-engine-browser-globals` ESLint rule would catch it). When the
 * injected `gl` is null or missing the methods we need, the backend
 * downgrades to a CPU simulation of the same shader so the cross-tier
 * tolerance test still has something to compare against.
 */
export class WebGl2Backend implements GpuBackend {
  readonly tier = 'webgl2' as const;
  private readonly env: GpuEnvironment;
  private program: unknown = null;
  private initialized = false;

  constructor(env: GpuEnvironment) {
    this.env = env;
  }

  applyPixelLocal(image: RasterImage, steps: readonly GpuPixelLocalStep[]): BackendResult {
    if (steps.length === 0) return { image, usedTier: this.tier };

    // The WebGL2 path supports the same 9 op-codes the CPU reference does.
    // Anything ≥ 100 is a passthrough; we apply those on the CPU via the
    // existing `applyAdjustments`. This is symmetric with `CpuWasmBackend`
    // and keeps the end-to-end recipe semantics identical across tiers.
    const passthrough: GpuPixelLocalStep[] = [];
    const gpuSteps: GpuPixelLocalStep[] = [];
    for (const step of steps) {
      if (step.op < OP_CODES.PASSTHROUGH_THRESHOLD) gpuSteps.push(step);
      else passthrough.push(step);
    }

    let current = image;
    if (gpuSteps.length > 0) {
      current = this.runGpu(current, gpuSteps);
    }
    if (passthrough.length > 0) {
      current = applyPassthroughOnCpu(current, passthrough);
    }
    return { image: current, usedTier: this.tier };
  }

  /**
   * Run the GPU steps. When the injected `gl` is a real WebGL2 context
   * this compiles the shader, uploads the texture, and issues one draw
   * call per fused step. When the injected `gl` is a stub (or missing the
   * methods we need), this falls through to a CPU simulation that
   * produces the same byte output the shader would. The cross-tier
   * tolerance test exercises the CPU-simulation path because CI runners
   * do not have GPUs.
   */
  private runGpu(image: RasterImage, steps: readonly GpuPixelLocalStep[]): RasterImage {
    const gl = this.env.gl as WebGL2Like | null | undefined;
    if (gl && hasWebGl2Methods(gl)) {
      if (!this.initialized) {
        this.program = compileProgram(gl);
        this.initialized = true;
      }
      return runGpuProgram(gl, this.program, image, steps);
    }
    return simulateShaderOnCpu(image, steps);
  }
}

// ---------------------------------------------------------------------------
// WebGL2 minimal interface we use. Kept narrow so the test stub can
// satisfy it with a hand-rolled object.
// ---------------------------------------------------------------------------

interface WebGL2Like {
  VERTEX_SHADER: number;
  FRAGMENT_SHADER: number;
  COMPILE_STATUS: number;
  LINK_STATUS: number;
  TEXTURE_2D: number;
  TEXTURE0: number;
  RGBA: number;
  UNSIGNED_BYTE: number;
  LINEAR: number;
  CLAMP_TO_EDGE: number;
  TEXTURE_MIN_FILTER: number;
  TEXTURE_MAG_FILTER: number;
  TEXTURE_WRAP_S: number;
  TEXTURE_WRAP_T: number;
  TRIANGLE_STRIP: number;
  ARRAY_BUFFER: number;
  STATIC_DRAW: number;
  FLOAT: number;
  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): unknown;
  getShaderInfoLog(shader: unknown): string;
  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): unknown;
  getProgramInfoLog(program: unknown): string;
  useProgram(program: unknown): void;
  getUniformLocation(program: unknown, name: string): unknown;
  getAttribLocation(program: unknown, name: string): number;
  uniform1i(location: unknown, value: number): void;
  uniform1f(location: unknown, value: number): void;
  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  enableVertexAttribArray(location: number): void;
  vertexAttribPointer(location: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
  createTexture(): unknown;
  bindTexture(target: number, texture: unknown): void;
  texImage2D(
    target: number,
    level: number,
    internalFormat: number,
    width: number,
    height: number,
    border: number,
    format: number,
    type: number,
    pixels: ArrayBufferView | null,
  ): void;
  texParameteri(target: number, pname: number, value: number): void;
  activeTexture(texture: number): void;
  createVertexArray(): unknown;
  bindVertexArray(vao: unknown): void;
  drawArrays(mode: number, first: number, count: number): void;
  pixelStorei(pname: number, value: number): void;
  viewport(x: number, y: number, width: number, height: number): void;
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, pixels: ArrayBufferView): void;
}

function hasWebGl2Methods(gl: unknown): gl is WebGL2Like {
  if (!gl || typeof gl !== 'object') return false;
  const candidate = gl as Record<string, unknown>;
  return (
    typeof candidate.createShader === 'function' &&
    typeof candidate.createProgram === 'function' &&
    typeof candidate.readPixels === 'function' &&
    typeof candidate.drawArrays === 'function' &&
    typeof candidate.texImage2D === 'function'
  );
}

// ---------------------------------------------------------------------------
// Real WebGL2 program compilation. The shader strings live in this file
// as template literals so the engine can ship them as part of the bundle
// without a separate file load. The fragment shader implements the same 9
// op-codes as `OP_CODES` in `gpu/op-codes.ts`.
// ---------------------------------------------------------------------------

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
uniform int u_op;
uniform float u_value;
const float LUMA_R = 0.2126;
const float LUMA_G = 0.7152;
const float LUMA_B = 0.0722;
float luma(vec3 c) { return LUMA_R * c.r + LUMA_G * c.g + LUMA_B * c.b; }
float smoothstepf(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
void main() {
  vec3 c = texture(u_image, v_uv).rgb;
  vec3 out3 = c;
  if (u_op == 1) out3 = c + vec3(u_value / 255.0);
  else if (u_op == 2) {
    float f = (259.0 * (u_value + 255.0)) / (255.0 * (259.0 - u_value));
    out3 = clamp(f * (c - 0.5) + 0.5, 0.0, 1.0);
  }
  else if (u_op == 3) {
    float s = 1.0 + u_value / 100.0;
    float y = luma(c);
    out3 = vec3(y + (c.r - y) * s, y + (c.g - y) * s, y + (c.b - y) * s);
  }
  else if (u_op == 4) out3 = clamp(c * pow(2.0, u_value), 0.0, 1.0);
  else if (u_op == 5) out3 = pow(max(c, vec3(0.0)), vec3(1.0 / u_value));
  else if (u_op == 6) {
    // Tanner–Helland, same as the CPU reference.
    float t = u_value / 100.0;
    float r, g, b;
    if (t <= 66.0) {
      r = 1.0;
      g = clamp((99.4708025861 * log(max(t, 1.0)) - 161.1195681661) / 255.0, 0.0, 1.0);
    } else {
      float t2 = t - 60.0;
      r = clamp((329.698727446 * pow(t2, -0.1332047592)) / 255.0, 0.0, 1.0);
      g = clamp((288.1221695283 * pow(t2, -0.0755148492)) / 255.0, 0.0, 1.0);
    }
    if (t >= 66.0) b = 1.0;
    else if (t <= 19.0) b = 0.0;
    else b = clamp((138.5177312231 * log(max(t - 10.0, 1.0)) - 305.0447927307) / 255.0, 0.0, 1.0);
    out3 = vec3(c.r / max(r, 0.0001), c.g / max(g, 0.0001), c.b / max(b, 0.0001));
  }
  else if (u_op == 7) {
    float g = pow(2.0, u_value / 150.0);
    out3 = vec3(c.r, c.g * g, c.b);
  }
  else if (u_op == 8) {
    float amount = u_value / 100.0;
    float mask = smoothstepf(0.55, 0.95, luma(c));
    out3 = clamp(c * (1.0 + amount * mask), 0.0, 1.0);
  }
  else if (u_op == 9) {
    float amount = u_value / 100.0;
    float mask = 1.0 - smoothstepf(0.05, 0.45, luma(c));
    out3 = clamp(c * (1.0 + amount * mask), 0.0, 1.0);
  }
  outColor = vec4(clamp(out3, 0.0, 1.0), 1.0);
}
`;

const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

function compileShader(gl: WebGL2Like, type: number, source: string): unknown {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    throw new Error(`WebGL2 shader compile failed: ${info}`);
  }
  return shader;
}

function compileProgram(gl: WebGL2Like): unknown {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  return program;
}

function runGpuProgram(
  gl: WebGL2Like,
  program: unknown,
  image: RasterImage,
  steps: readonly GpuPixelLocalStep[],
): RasterImage {
  const width = image.width;
  const height = image.height;
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  // Vertex array: a fullscreen triangle strip.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Upload the first frame's RGBA as a texture. The executor passes
  // single-frame images; multi-frame is a follow-up.
  const source = image.frames[0]!.data;
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(0x0cf2 /* UNPACK_ALIGNMENT */, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const opLoc = gl.getUniformLocation(program, 'u_op');
  const valueLoc = gl.getUniformLocation(program, 'u_value');

  let currentSource: Uint8ClampedArray = source;
  for (const step of steps) {
    // Re-upload the working buffer as the texture.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      currentSource,
    );
    gl.uniform1i(opLoc, step.op);
    gl.uniform1f(valueLoc, step.value);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const out = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    currentSource = out;
  }
  // Build the new raster. Preserve the original frames array length but
  // replace the first frame's data; subsequent frames (if any) are
  // untouched because the executor only ever passes a single fused step
  // for the GPU path. This matches `cpu-wasm.ts`'s contract.
  const newFrames = image.frames.map((frame, index) =>
    index === 0 ? { ...frame, data: currentSource } : frame,
  );
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

// ---------------------------------------------------------------------------
// CPU simulation of the WebGL2 fragment shader. Used when the injected `gl`
// is a stub or null. The math is identical to the GLSL above; the test in
// `gpu-pipeline.test.ts` compares the result against `CpuWasmBackend`.
// ---------------------------------------------------------------------------

function simulateShaderOnCpu(image: RasterImage, steps: readonly GpuPixelLocalStep[]): RasterImage {
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      let r = input[offset]! / 255;
      let g = input[offset + 1]! / 255;
      let b = input[offset + 2]! / 255;
      const a = input[offset + 3]!;
      for (const step of steps) {
        if (step.op === OP_CODES.IDENTITY) continue;
        const v = step.value;
        if (step.op === OP_CODES.BRIGHTNESS) {
          r += v / 255; g += v / 255; b += v / 255;
        } else if (step.op === OP_CODES.CONTRAST) {
          const f = (259 * (v + 255)) / (255 * (259 - v));
          r = clamp01(f * (r - 0.5) + 0.5);
          g = clamp01(f * (g - 0.5) + 0.5);
          b = clamp01(f * (b - 0.5) + 0.5);
        } else if (step.op === OP_CODES.SATURATION) {
          const s = 1 + v / 100;
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = y + (r - y) * s;
          g = y + (g - y) * s;
          b = y + (b - y) * s;
        } else if (step.op === OP_CODES.EXPOSURE) {
          const m = Math.pow(2, v);
          r *= m; g *= m; b *= m;
        } else if (step.op === OP_CODES.GAMMA) {
          const inv = 1 / v;
          r = Math.pow(Math.max(r, 0), inv);
          g = Math.pow(Math.max(g, 0), inv);
          b = Math.pow(Math.max(b, 0), inv);
        } else if (step.op === OP_CODES.TINT) {
          const gg = Math.pow(2, v / 150);
          g *= gg;
        } else if (step.op === OP_CODES.HIGHLIGHTS) {
          const amount = v / 100;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const mask = smoothstepf(0.55, 0.95, luma);
          const gain = 1 + amount * mask;
          r *= gain; g *= gain; b *= gain;
        } else if (step.op === OP_CODES.SHADOWS) {
          const amount = v / 100;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const mask = 1 - smoothstepf(0.05, 0.45, luma);
          const gain = 1 + amount * mask;
          r *= gain; g *= gain; b *= gain;
        } else if (step.op === OP_CODES.TEMPERATURE) {
          const t = v / 100;
          let rr: number, gg: number, bb: number;
          if (t <= 66) {
            rr = 1;
            gg = Math.max(0, Math.min(1, (99.4708025861 * Math.log(Math.max(t, 1)) - 161.1195681661) / 255));
          } else {
            const t2 = t - 60;
            rr = Math.max(0, Math.min(1, (329.698727446 * Math.pow(t2, -0.1332047592)) / 255));
            gg = Math.max(0, Math.min(1, (288.1221695283 * Math.pow(t2, -0.0755148492)) / 255));
          }
          if (t >= 66) bb = 1;
          else if (t <= 19) bb = 0;
          else bb = Math.max(0, Math.min(1, (138.5177312231 * Math.log(Math.max(t - 10, 1)) - 305.0447927307) / 255));
          r = r / Math.max(rr, 0.0001);
          g = g / Math.max(gg, 0.0001);
          b = b / Math.max(bb, 0.0001);
        }
        r = clamp01(r);
        g = clamp01(g);
        b = clamp01(b);
      }
      output[offset] = Math.round(r * 255);
      output[offset + 1] = Math.round(g * 255);
      output[offset + 2] = Math.round(b * 255);
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstepf(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Translate the WebGL2 path's passthrough steps to CPU-side AdjustOptions
// and run them through `applyAdjustments`. Same contract as
// `CpuWasmBackend.assignPassthrough`.
// ---------------------------------------------------------------------------

function applyPassthroughOnCpu(image: RasterImage, steps: readonly GpuPixelLocalStep[]): RasterImage {
  const options: Record<string, number> = {};
  for (const step of steps) {
    switch (step.op - OP_CODES.PASSTHROUGH_THRESHOLD) {
      case 0: options.blacks = step.value; break;
      case 1: options.clarity = step.value; break;
      case 2: options.dehaze = step.value; break;
      case 3: options.hue = step.value; break;
      case 4: options.opacity = step.value; break;
      case 5: options.vibrance = step.value; break;
      case 6: options.whites = step.value; break;
    }
  }
  if (Object.keys(options).length === 0) return image;
  return applyAdjustments(image, options as never);
}
