import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import {
  floodFill,
  colourRange,
  chromaKey,
  otsuThreshold,
  sauvolaThreshold,
  canny,
  sobel,
  scharr,
  hough,
  morphology,
  connectedComponents,
  integralImage,
} from '../src/cv/index.js';

describe('P4-01 CV primitives', () => {
  it('flood-fill produces correct mask for opaque gradient', () => {
    const image = createRaster(
      4,
      4,
      new Uint8ClampedArray([
        255, 0, 0, 255, 255, 0, 0, 255, 128, 128, 128, 255, 128, 128, 128, 255, 255, 0, 0, 255, 255,
        0, 0, 255, 128, 128, 128, 255, 128, 128, 128, 255, 255, 0, 0, 255, 255, 0, 0, 255, 128, 128,
        128, 255, 128, 128, 128, 255, 255, 0, 0, 255, 255, 0, 0, 255, 128, 128, 128, 255, 128, 128,
        128, 255,
      ]),
    );
    const mask = floodFill(image, 0, 0, 10);
    expect(mask.length).toBe(16);
    expect(mask[0]).toBe(255); // seed filled
  });

  it('colour-range selects pixels within range', () => {
    const image = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 128, 128, 128, 255, 128, 128, 128, 255,
      ]),
    );
    const mask = colourRange(image, { r: 120, g: 120, b: 120 }, { r: 140, g: 140, b: 140 });
    expect(mask[0]).toBe(0);
    expect(mask[15]).toBe(255); // gray pixel filled
  });

  it('chroma-key excludes matching color', () => {
    const image = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        255, 255, 255, 255, 255, 0, 0, 255, 0, 128, 0, 255, 128, 255, 255, 255,
      ]),
    );
    const mask = chromaKey(image, { r: 255, g: 255, b: 255 }, 5);
    expect(mask[0]).toBe(0); // white excluded
    expect(mask[15]).toBe(255); // near-white included
  });

  it('otsu-threshold returns binary mask', () => {
    const image = createRaster(
      4,
      4,
      new Uint8ClampedArray([
        10, 10, 10, 255, 10, 10, 10, 255, 200, 200, 200, 255, 200, 200, 200, 255, 10, 10, 10, 255,
        10, 10, 10, 255, 200, 200, 200, 255, 200, 200, 200, 255, 10, 10, 10, 255, 10, 10, 10, 255,
        200, 200, 200, 255, 200, 200, 200, 255, 10, 10, 10, 255, 10, 10, 10, 255, 200, 200, 200,
        255, 200, 200, 200, 255,
      ]),
    );
    const mask = otsuThreshold(image);
    expect(mask.length).toBe(16);
    expect(mask[0]).toBe(0);
    expect(mask[12]).toBe(255);
  });

  it('sauvola-threshold produces binary mask', () => {
    const image = createRaster(
      3,
      2,
      new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255,
        255, 255, 255, 255, 255,
      ]),
    );
    const mask = sauvolaThreshold(image);
    expect(mask.length).toBe(6);
    expect(mask[0]).toBe(255);
    expect(mask[12]).toBe(0);
  });

  it('canny detects edges', () => {
    const image = createRaster(
      5,
      5,
      new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255,
      ]),
    );
    const mask = canny(image, 10, 30);
    expect(mask.length).toBe(25);
  });

  it('sobel produces gradient magnitude mask', () => {
    const image = createRaster(
      3,
      3,
      new Uint8ClampedArray([
        0, 0, 0, 255, 0, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255,
        255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255,
      ]),
    );
    const mask = sobel(image);
    expect(mask.length).toBe(9);
  });

  it('scharr produces gradient magnitude mask', () => {
    const image = createRaster(
      3,
      3,
      new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255,
        255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const mask = scharr(image);
    expect(mask.length).toBe(9);
  });

  it('hough detects lines from simple pattern', () => {
    const image = createRaster(
      5,
      5,
      new Uint8ClampedArray([
        0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0,
        255, 0, 255, 0, 255, 0, 255, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
        255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const result = hough(image);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it('morphology erode and dilate produce masks', () => {
    const image = createRaster(
      3,
      3,
      new Uint8ClampedArray([
        255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const eroded = morphology(image, 'erode', 1);
    expect(eroded.width).toBe(3);
    expect(eroded.height).toBe(3);
    const dilated = morphology(image, 'dilate', 1);
    expect(dilated.width).toBe(3);
  });

  it('connected-components labels separate regions', () => {
    const mask = new Uint8ClampedArray(4 * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) mask[y * 4 + x] = 255;
    }
    const components = connectedComponents(
      {
        width: 4,
        height: 4,
        frames: [{ data: mask, durationMs: 0 }],
        colorSpace: 'srgb',
        bitDepth: 8,
        premultipliedAlpha: false,
      },
      4,
      4,
    );
    expect(components.length).toBeGreaterThan(0);
    expect(components[0]!.label).toBe(1);
  });

  it('integral-image produces cumulative array', () => {
    const image = createRaster(
      3,
      2,
      new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]),
    );
    const integral = integralImage(image);
    expect(integral.length).toBe(4 * 3); // (w+1)*(h+1)
  });
});
