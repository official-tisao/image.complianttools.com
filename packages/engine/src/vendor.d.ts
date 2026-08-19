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
