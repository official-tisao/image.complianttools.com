# T32 checkpoint conversion

This directory contains the offline conversion and parity-check toolchain for the two owner-approved Real-ESRGAN checkpoints in `docs/model-assets.json`. Conversion reads only the cached checkpoint files; it does not download weights. It validates each registered byte size and SHA-256 before calling `torch.load`.

## Pinned source and model architecture

- PyTorch CPU: `2.5.1+cpu`; torchvision `0.20.1+cpu`
- ONNX: `1.17.0`; ONNX Runtime CPU: `1.20.1`
- NumPy: `2.5.3`; Pillow: `12.3.0`
- BasicSR: tag `v1.4.2`, commit `651835a1b9d38dbbdaf45750f56906be2364f01a`, Apache-2.0; source architecture [RRDBNet](https://github.com/XPixelGroup/BasicSR/blob/651835a1b9d38dbbdaf45750f56906be2364f01a/basicsr/archs/rrdbnet_arch.py), license [README](https://github.com/XPixelGroup/BasicSR/blob/651835a1b9d38dbbdaf45750f56906be2364f01a/LICENSE/README.md).
- The official Real-ESRGAN inference source constructs RGB RRDBNet with 23 blocks, 64 feature channels and 32 growth channels. It uses scale 4 for `RealESRGAN_x4plus.pth` and scale 2 for `RealESRGAN_x2plus.pth`, loading `params_ema` when available and otherwise `params`.

The lock file resolves every Python dependency. Python 3.12 is required. BasicSR 1.4.2 imports a torchvision module removed after torchvision 0.15, so the conversion script installs a narrowly-scoped compatibility alias before importing the pinned BasicSR architecture; it does not alter package files.

## Run on Windows

Run from the repository root in PowerShell. The environment and converted models are kept under `%TEMP%`:

```powershell
$conversionDir = "packages/engine/bench/escalation/t32/conversion"
$env:UV_PROJECT_ENVIRONMENT = Join-Path ([System.IO.Path]::GetTempPath()) "image-complianttools-t32-conversion-venv"
uv sync --project $conversionDir --locked --python 3.12
uv run --project $conversionDir --locked python convert.py
uv run --project $conversionDir --locked python benchmark_model.py
```

Required cached inputs:

```text
%TEMP%\image-complianttools-models\RealESRGAN_x4plus.pth
%TEMP%\image-complianttools-models\RealESRGAN_x2plus.pth
```

The outputs go to `%TEMP%\image-complianttools-t32-onnx` by default. `report.json` records the register identity, ONNX byte sizes and SHA-256 digests, package versions, and PyTorch-vs-ONNX Runtime CPU errors on two deterministic dynamic input shapes per scale. These ONNX artifacts are for conversion/parity review only; this tool does not deploy or register them.

The checked-in [`cpu-parity-report.json`](cpu-parity-report.json) records the completed CPU export and parity results without paths to the local cache or copies of either model. [`benchmark_model.py`](benchmark_model.py) runs the registered x2 ONNX model on the four exact low-resolution/reference PNG pairs, writes lossless model output PNGs into `t32/artifacts`, and records model-specific quality and latency in `t32/model-results.json`. The model benchmark uses the same PSNR and SSIM definitions as the Tier 1 benchmark; its CPU latency is not directly comparable with the separate Node.js measurements.
