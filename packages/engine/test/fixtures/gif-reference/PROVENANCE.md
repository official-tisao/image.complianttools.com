# GIF reference corpus provenance

These 20 GIF files are the P2-05 encoder-size comparison corpus. They derive from
[`imazen/codec-corpus`](https://github.com/imazen/codec-corpus) commit
`28205bbc5cf40364d012c462240ba28143373d67`, specifically its `gb82/` and `gb82-sc/`
datasets. Both source directories declare their contents under CC0 1.0; the complete license is
included as `LICENSE-CC0-1.0.txt`.

The source PNGs were converted to baseline GIFs on Windows using the operating system's
`System.Drawing` GIF encoder. This creates a neutral indexed input shared by our encoder and the
external reference optimizer. `SHA256SUMS` pins the exact converted files.

The corpus contains 12 real object/nature scenes and 8 technical screenshots. Every image was
visually inspected on 2026-08-22. Images depicting recognizable people and screenshots containing
personal message content were explicitly excluded.

- `gb82`: bulb, dog, flowers, grass, guitar, house, pixel, sand, sumac, waves, haze, reflect.
- `gb82-sc`: codec_wiki, graph, gui, imac_dark, imac_g3, terminal, windows, windows95.

Run the comparison with an external, non-shipping Gifsicle 1.95 executable:

```powershell
$env:GIFSICLE_PATH = 'C:\path\to\gifsicle.exe'
node scripts/verify-gif-reference.mjs
```

The executable is deliberately not a package dependency, fixture, or repository artifact. The
verifier requires all 20 individual outputs and the aggregate output to be no larger than 110% of
`gifsicle --optimize=3` output.
