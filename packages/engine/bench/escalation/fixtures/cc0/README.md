# P4-21 CC0 image fixtures

The `manifest.json` file is the item-by-item register for the CC0 images in this directory. It stores each exact source image URL, source page, source metadata API URL and snapshot, source-reported dimensions, local byte size, SHA-256, and license evidence. The OCR entry also records the English ground truth and exact crop recipe used by T62. Run `node scripts/verify-p4-21-cc0-fixtures.mjs` from the repository root to verify the local bytes and metadata evidence.

## Finding more samples

1. **Cleveland Museum of Art:** search the [Open Access API](https://openaccess-api.clevelandart.org/) with `cc0` and `has_image=1`. Keep an item only when its individual response says `share_license_status: "CC0"` and contains the chosen image rendition URL. The API documentation distinguishes CC0 image records from records whose metadata is CC0 but whose images are restricted.
2. **Wikimedia Commons:** start from an individual file page, then query that file through the MediaWiki API with `prop=imageinfo&iiprop=url|size|extmetadata`. Keep it only when that file's `LicenseShortName` is `CC0` and its `LicenseUrl` points to the CC0 1.0 deed. Commons licensing varies by file, so a category or search result is not evidence for a specific image.
3. Download the exact rendition used. Save the item/file page and API response locally, record creator/title/dimensions, retrieval date, byte size, and SHA-256, then add the row to `manifest.json`. Hash both the image and metadata snapshot. Verify the downloaded content against those values before using it.
4. Treat any crop, resize, blur, compression, or downsample as a derived fixture. Record its source fixture ID and hash, transformation parameters, output dimensions, and output hash so another run can reproduce the pair. The T62 crop is defined in the `ocrSample` block of `manifest.json`; run `node packages/engine/bench/escalation/t62/cc0-run.mjs` to reproduce its browser decode and OCR measurement.

CC0 clears copyright and related rights the source can waive. It does not automatically clear independent privacy, publicity, trademark, or other third-party rights. These initial samples avoid identifiable living people. The plant photo is focus-stacked and the historical Rome map is artwork; neither is suitable as pristine image-restoration ground truth or modern OCR ground truth, respectively.
