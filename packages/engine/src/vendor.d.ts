// Type declarations for external modules without built-in types

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

declare module 'libheif-js/wasm-bundle.js' {
  // libheif-js/wasm-bundle exports an Emscripten Module factory function.
  // Calling it returns the initialized Module with HeifDecoder, etc.
  interface HeifDecoder {
    decode(input: Uint8Array): HeifImage[];
    decoder: { delete(): void };
  }

  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      buffer: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
    free(): void;
  }

  interface LibheifModule {
    HeifDecoder: new () => HeifDecoder;
    [key: string]: unknown;
  }

  // The module exports a factory function that creates the Module
  const libheifFactory: () => Promise<LibheifModule>;
  export default libheifFactory;
}
