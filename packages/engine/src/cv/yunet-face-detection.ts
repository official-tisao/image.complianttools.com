/**
 * P4-17 / T57 — consented YuNet 2023mar ONNX face-box inference.
 *
 * The model is never fetched or cached here. The caller supplies bytes after its consent flow.
 * ONNX Runtime Web is opened lazily on the WASM provider only.
 *
 * Output assumptions match OpenCV's FaceDetectorYN implementation for the pinned
 * OpenCV Zoo 2023mar model: one float32 input [1,3,640,640]; 12 outputs named
 * cls_{8,16,32}, obj_{8,16,32}, bbox_{8,16,32}, and kps_{8,16,32}; and [1,A,C]
 * heads where A=(640/stride)^2 and C is 1, 4, or 10. cls/obj are already probabilities.
 * Box offsets are distances in stride units from the grid-cell top-left; width/height
 * are log distances. The score is sqrt(clamp(cls)*clamp(obj)); OpenCV combines the
 * same values and decodes the same box formula before thresholding and NMS.
 */

import type { Tensor as OrtTensor } from 'onnxruntime-web';
import { probeRuntimeCapabilities } from '../capabilities.js';
import type { RasterImage } from '../types.js';
import {
  closeOnnxRuntime,
  createFloatOnnxTensor,
  initOnnxRuntime,
  openOnnxRuntime,
  runOnnxInference,
  type OnnxRuntimeState,
  type OnnxSessionConfig,
  type OnnxTileFeeds,
  type OnnxTileOutputs,
} from '../onnx-runtime.js';

const YUNET_INPUT_SIZE = 640;
const YUNET_STRIDES = [8, 16, 32] as const;
const YUNET_DEFAULT_SCORE_THRESHOLD = 0.6;
const YUNET_DEFAULT_NMS_THRESHOLD = 0.3;
const YUNET_DEFAULT_TOP_K = 5000;

export interface YuNetModelSource {
  /** The caller-supplied bytes for the pinned OpenCV Zoo 2023mar ONNX model. */
  readonly modelData: Uint8Array | ArrayBuffer;
  /** Must be true only after the caller's explicit model consent flow succeeds. */
  readonly consentGranted: boolean;
}

export interface YuNetFaceBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly confidence: number;
}

export interface YuNetPreparedInput {
  /** BGR, NCHW float32, raw 0..255 values; aspect-preserving resize, zero pad right/bottom. */
  readonly data: Float32Array;
  readonly dimensions: readonly [1, 3, 640, 640];
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface YuNetNumericOutput {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number>;
}

export type YuNetOutputMap = Readonly<Record<string, unknown>>;

export interface YuNetRuntimeAdapter {
  open(state: OnnxRuntimeState): Promise<OnnxRuntimeState>;
  createTensor(data: Float32Array, dimensions: readonly number[]): Promise<OrtTensor>;
  run(state: OnnxRuntimeState, feeds: OnnxTileFeeds): Promise<OnnxTileOutputs>;
  close(state: OnnxRuntimeState): Promise<void>;
}

export interface YuNetOptions {
  readonly scoreThreshold?: number;
  readonly nmsThreshold?: number;
  readonly topK?: number;
  /** Test seam and host override; production defaults to lazy ONNX Runtime Web WASM. */
  readonly runtime?: YuNetRuntimeAdapter;
}

const defaultRuntime: YuNetRuntimeAdapter = {
  open: openOnnxRuntime,
  createTensor: createFloatOnnxTensor,
  run: runOnnxInference,
  close: closeOnnxRuntime,
};

function validateImage(image: RasterImage, frameIndex: number) {
  if (
    !Number.isInteger(image.width) ||
    image.width <= 0 ||
    !Number.isInteger(image.height) ||
    image.height <= 0
  ) {
    throw new RangeError('YuNet input dimensions must be positive integers.');
  }
  if (image.colorSpace !== 'srgb' && image.colorSpace !== 'gray') {
    throw new RangeError(`YuNet input requires sRGB or grayscale pixels; got ${image.colorSpace}.`);
  }
  if (image.bitDepth !== 8 && image.bitDepth !== 16) {
    throw new RangeError('YuNet input must contain 8-bit or 16-bit RGBA samples.');
  }
  const frame = image.frames[frameIndex];
  if (!frame) throw new RangeError(`YuNet input frame ${frameIndex} does not exist.`);
  const sampleCount = image.width * image.height * 4;
  if (!Number.isSafeInteger(sampleCount) || frame.data.length !== sampleCount) {
    throw new RangeError('YuNet input frame must contain RGBA samples for every pixel.');
  }
  if (image.bitDepth === 16 && (!frame.data16 || frame.data16.length !== sampleCount)) {
    throw new RangeError('16-bit YuNet input requires complete RGBA data16 samples.');
  }
  return frame;
}

function readSrgbChannel(
  image: RasterImage,
  frameData: Uint8ClampedArray | Uint16Array,
  x: number,
  y: number,
  channel: number,
): number {
  const offset = (y * image.width + x) * 4;
  const maximum = image.bitDepth === 16 ? 65535 : 255;
  const sourceChannel = image.colorSpace === 'gray' ? 0 : channel;
  const alpha = frameData[offset + 3]! / maximum;
  const value = frameData[offset + sourceChannel]! / maximum;
  // RasterImage can carry premultiplied browser pixels. Remove that encoding before inference;
  // fully transparent pixels have no recoverable color and are represented as black.
  const straight = image.premultipliedAlpha ? (alpha > 0 ? value / alpha : 0) : value;
  return Math.min(255, Math.max(0, straight * 255));
}

function bilinearChannel(
  image: RasterImage,
  frameData: Uint8ClampedArray | Uint16Array,
  x: number,
  y: number,
  channel: number,
): number {
  const sourceX = Math.min(image.width - 1, Math.max(0, x));
  const sourceY = Math.min(image.height - 1, Math.max(0, y));
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;
  const top =
    readSrgbChannel(image, frameData, x0, y0, channel) * (1 - tx) +
    readSrgbChannel(image, frameData, x1, y0, channel) * tx;
  const bottom =
    readSrgbChannel(image, frameData, x0, y1, channel) * (1 - tx) +
    readSrgbChannel(image, frameData, x1, y1, channel) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Prepare the pinned model's fixed square input without browser canvas dependencies. */
export function prepareYuNetInput(image: RasterImage, frameIndex = 0): YuNetPreparedInput {
  const frame = validateImage(image, frameIndex);
  const targetScale = Math.min(YUNET_INPUT_SIZE / image.width, YUNET_INPUT_SIZE / image.height);
  const resizedWidth = Math.max(
    1,
    Math.min(YUNET_INPUT_SIZE, Math.round(image.width * targetScale)),
  );
  const resizedHeight = Math.max(
    1,
    Math.min(YUNET_INPUT_SIZE, Math.round(image.height * targetScale)),
  );
  const scaleX = resizedWidth / image.width;
  const scaleY = resizedHeight / image.height;
  const planeSize = YUNET_INPUT_SIZE * YUNET_INPUT_SIZE;
  const data = new Float32Array(planeSize * 3);
  const frameData = image.bitDepth === 16 ? frame.data16! : frame.data;

  // OpenCV's blobFromImage uses BGR order and no scale/mean for YuNet. The original 2023mar
  // model is fixed at 640x640, so fit the full source into that square and pad right/bottom.
  // The coordinate transform below reverses the resize and clipping removes padded-only boxes.
  for (let y = 0; y < resizedHeight; y++) {
    const sourceY = (y + 0.5) / scaleY - 0.5;
    for (let x = 0; x < resizedWidth; x++) {
      const sourceX = (x + 0.5) / scaleX - 0.5;
      const pixel = y * YUNET_INPUT_SIZE + x;
      data[pixel] = bilinearChannel(image, frameData, sourceX, sourceY, 2); // B
      data[planeSize + pixel] = bilinearChannel(image, frameData, sourceX, sourceY, 1); // G
      data[planeSize * 2 + pixel] = bilinearChannel(image, frameData, sourceX, sourceY, 0); // R
    }
  }

  return {
    data,
    dimensions: [1, 3, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE],
    sourceWidth: image.width,
    sourceHeight: image.height,
    scaleX,
    scaleY,
  };
}

function validateThreshold(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`YuNet ${name} must be a finite number from 0 to 1.`);
  }
}

function validateTopK(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('YuNet topK must be a positive safe integer.');
  }
}

interface Candidate extends YuNetFaceBox {
  readonly order: number;
}

function head(
  outputs: YuNetOutputMap,
  name: string,
  anchors: number,
  channels: number,
): YuNetNumericOutput {
  const raw = outputs[name];
  if (!raw || typeof raw !== 'object') throw new Error(`YuNet model output ${name} is missing.`);
  const output = raw as { readonly dims?: unknown; readonly data?: unknown };
  if (
    !Array.isArray(output.dims) ||
    !output.dims.every((dimension) => Number.isInteger(dimension)) ||
    (!Array.isArray(output.data) && !ArrayBuffer.isView(output.data)) ||
    typeof (output.data as { readonly length?: unknown } | null)?.length !== 'number'
  ) {
    throw new RangeError(`YuNet output ${name} must expose numeric dimensions and tensor data.`);
  }
  const dims = output.dims as number[];
  const data = output.data as ArrayLike<unknown>;
  const expected = [1, anchors, channels];
  if (
    dims.length !== expected.length ||
    dims.some((dimension, index) => dimension !== expected[index]) ||
    data.length !== anchors * channels
  ) {
    throw new RangeError(
      `YuNet output ${name} must have shape [1, ${anchors}, ${channels}] and ${anchors * channels} values.`,
    );
  }
  for (let index = 0; index < data.length; index++) {
    if (typeof data[index] !== 'number') {
      throw new RangeError(`YuNet output ${name} must contain numeric tensor values.`);
    }
  }
  return { dims, data: data as ArrayLike<number> };
}

function intersectionOverUnion(left: Candidate, right: Candidate): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Decode the 12 named OpenCV Zoo YuNet prediction heads into clipped original-image boxes. */
export function decodeYuNetOutputs(
  outputs: YuNetOutputMap,
  transform: Pick<YuNetPreparedInput, 'sourceWidth' | 'sourceHeight' | 'scaleX' | 'scaleY'>,
  options: Pick<YuNetOptions, 'scoreThreshold' | 'nmsThreshold' | 'topK'> = {},
): YuNetFaceBox[] {
  const scoreThreshold = options.scoreThreshold ?? YUNET_DEFAULT_SCORE_THRESHOLD;
  const nmsThreshold = options.nmsThreshold ?? YUNET_DEFAULT_NMS_THRESHOLD;
  const topK = options.topK ?? YUNET_DEFAULT_TOP_K;
  validateThreshold(scoreThreshold, 'scoreThreshold');
  validateThreshold(nmsThreshold, 'nmsThreshold');
  validateTopK(topK);
  if (
    !Number.isSafeInteger(transform.sourceWidth) ||
    transform.sourceWidth < 1 ||
    !Number.isSafeInteger(transform.sourceHeight) ||
    transform.sourceHeight < 1 ||
    !Number.isFinite(transform.scaleX) ||
    transform.scaleX <= 0 ||
    !Number.isFinite(transform.scaleY) ||
    transform.scaleY <= 0
  ) {
    throw new RangeError('YuNet source dimensions and resize scales must be positive and finite.');
  }

  const candidates: Candidate[] = [];
  let order = 0;
  for (const stride of YUNET_STRIDES) {
    const columns = YUNET_INPUT_SIZE / stride;
    const rows = YUNET_INPUT_SIZE / stride;
    const anchors = rows * columns;
    const classes = head(outputs, `cls_${stride}`, anchors, 1).data;
    const objects = head(outputs, `obj_${stride}`, anchors, 1).data;
    const boxes = head(outputs, `bbox_${stride}`, anchors, 4).data;
    // Landmarks are not part of the T57 output contract, but validate their pinned model shape
    // to fail closed if an unregistered or incompatible model is supplied.
    head(outputs, `kps_${stride}`, anchors, 10);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const classScore = Number(classes[index]);
        const objectScore = Number(objects[index]);
        if (!Number.isFinite(classScore) || !Number.isFinite(objectScore)) continue;
        const confidence = Math.sqrt(
          Math.min(1, Math.max(0, classScore)) * Math.min(1, Math.max(0, objectScore)),
        );
        if (confidence < scoreThreshold) continue;

        const dx = Number(boxes[index * 4]);
        const dy = Number(boxes[index * 4 + 1]);
        const logWidth = Number(boxes[index * 4 + 2]);
        const logHeight = Number(boxes[index * 4 + 3]);
        if (![dx, dy, logWidth, logHeight].every(Number.isFinite)) continue;
        const centerX = (column + dx) * stride;
        const centerY = (row + dy) * stride;
        const width = Math.exp(logWidth) * stride;
        const height = Math.exp(logHeight) * stride;
        if (
          !Number.isFinite(centerX) ||
          !Number.isFinite(centerY) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          continue;
        }
        candidates.push({
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          confidence,
          order: order++,
        });
      }
    }
  }

  candidates.sort((left, right) => right.confidence - left.confidence || left.order - right.order);
  const kept: Candidate[] = [];
  for (const candidate of candidates.slice(0, topK)) {
    if (kept.some((prior) => intersectionOverUnion(candidate, prior) > nmsThreshold)) continue;
    kept.push(candidate);
  }

  const boxes: YuNetFaceBox[] = [];
  for (const candidate of kept) {
    const left = Math.max(0, candidate.x / transform.scaleX);
    const top = Math.max(0, candidate.y / transform.scaleY);
    const right = Math.min(
      transform.sourceWidth,
      (candidate.x + candidate.width) / transform.scaleX,
    );
    const bottom = Math.min(
      transform.sourceHeight,
      (candidate.y + candidate.height) / transform.scaleY,
    );
    if (!(right > left && bottom > top)) continue;
    boxes.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      confidence: candidate.confidence,
    });
  }
  return boxes;
}

/** Run one frame through caller-supplied consented model bytes; no fetch or cache is performed. */
export async function detectFacesYuNet(
  image: RasterImage,
  source: YuNetModelSource,
  options: YuNetOptions = {},
): Promise<YuNetFaceBox[]> {
  if (source?.consentGranted !== true) {
    throw new Error('YuNet ONNX inference requires caller-confirmed model consent.');
  }
  if (
    !(source.modelData instanceof Uint8Array || source.modelData instanceof ArrayBuffer) ||
    source.modelData.byteLength === 0
  ) {
    throw new Error('YuNet inference requires non-empty caller-supplied model bytes.');
  }
  const prepared = prepareYuNetInput(image);
  const runtime = options.runtime ?? defaultRuntime;
  const config: OnnxSessionConfig = {
    modelName: 'opencv-zoo-yunet-face-detection-2023mar',
    modelData: source.modelData,
    consentGranted: true,
    webGpuPreferred: false,
  };
  let state = initOnnxRuntime(probeRuntimeCapabilities(), config);
  try {
    state = await runtime.open(state);
    if (!state.session)
      throw new Error('The YuNet ONNX runtime opened without an inference session.');
    if (state.session.inputNames.length !== 1) {
      throw new Error('The pinned YuNet model must expose exactly one input tensor.');
    }
    const inputName = state.session.inputNames[0];
    if (!inputName) throw new Error('The pinned YuNet model input name is empty.');
    const tensor = await runtime.createTensor(prepared.data, prepared.dimensions);
    const outputs = await runtime.run(state, { [inputName]: tensor } as OnnxTileFeeds);
    return decodeYuNetOutputs(outputs, prepared, options);
  } finally {
    if (state.session) await runtime.close(state);
  }
}
