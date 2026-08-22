declare module 'utif' {
  interface TiffIfd {
    width: number;
    height: number;
  }

  interface Utif {
    decode(buffer: ArrayBuffer): TiffIfd[];
    decodeImage(buffer: ArrayBuffer, ifd: TiffIfd): void;
    toRGBA8(ifd: TiffIfd): Uint8Array;
    encodeImage(rgba: Uint8Array, width: number, height: number, metadata?: object): ArrayBuffer;
  }

  const UTIF: Utif;
  export = UTIF;
}

declare module 'imagetracerjs' {
  const imageTracer: {
    imagedataToSVG(
      image: { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray },
      options?: Readonly<Record<string, unknown>>,
    ): string;
  };
  export default imageTracer;
}

declare module '@resvg/resvg-wasm/index_bg.wasm?url' {
  const url: string;
  export default url;
}
