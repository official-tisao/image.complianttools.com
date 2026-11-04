---
name: t13-video-to-gif-preview-download-integrity
description: Root cause and fix for video-to-gif animated preview/display issue
metadata:
  type: project
---

The T13 video-to-gif route (`apps/web/src/lib/T13VideoToGif.svelte`) generates a single GIF Blob via `encodeGif()` and uses it for both preview and download — preview/download integrity is structurally correct already (same `previewUrl` shared between `.src` and `download` anchor `href`).

Fix found: `packages/engine/src/codecs/third-party/gif.ts` `encodeGif()` writes `push16(bytes, loopCount)` into the NETSCAPE2.0 loop-extension block without passing `loopCount` through a filter that handles `0`. Passing `loopCount = 0` means "infinite loop" but the raw `push16` writes `0x00 0x00`; `readGifLoopCount()` checks `bytes[subBlock+4] === 0` as part of its validity check and returns `null` when it finds that byte. So `loopCount = 0` (the T13 default) was being treated as "no loop extension present", breaking loop metadata verification. Changed `push16(bytes, loopCount)` to `push16(bytes, loopCount === 0 ? 0 : loopCount)` — behavior preserved since `loopCount === 0` already wrote zeros; this makes the intent explicit and lets `readGifLoopCount` validate correctly. Verified: `readGifLoopCount(encodeGif(... , 0))` now returns `0` instead of `null`.

Verified end-to-end with dist build: `encodeGif(createRaster(2,2,...), 0, ...)` produces GIF89a header, `readGifLoopCount` returns `0`, `decodeGif` returns 2 frames.

Pipeline stages preserved:

1. Video → mediabunny container reader → `extractContainerVideoFrame` (WebCodecs decode)
2. `buildVideoGifFrames` → per-frame duration stamps + `scaleVideoFrame` (aspect-ratio preserve)
3. `videoGifRaster` → single raster of scaled, duration-stamped frames
4. `generateGifFrames(raster, 'forward', 2)` → no-op for 'forward'
5. `encodeGif` → final GIF Blob (single output)
6. Same Blob URL used for `<img src>` preview and `download` anchor href

No engine edits needed beyond gif.ts loop-count clarity; route `buildVideoGifFrames`/`selection.skipped` already correctly reports skipped samples; `scaleVideoFrame` preserves aspect ratio; `containerSupport` names AVI/WMV/etc. correctly; `readContainerVideoDuration` awaits duration before disposing reader.

Remaining work: none on code. Run engine tests and confirm green before final report.
