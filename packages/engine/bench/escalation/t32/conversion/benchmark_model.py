#!/usr/bin/env python3
"""Run the registered x2 ONNX model against the exact P4-21 T32 PNG pairs."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import statistics
import tempfile
import time
from typing import Any

import numpy as np
from PIL import Image


T32_DIR = Path(__file__).resolve().parents[1]
CONVERSION_DIR = Path(__file__).resolve().parent
CPU_PARITY_REPORT = CONVERSION_DIR / "cpu-parity-report.json"
TIER1_REPORT = T32_DIR / "results.json"
ARTIFACT_DIR = T32_DIR / "artifacts"
MODEL_FILENAME = "RealESRGAN_x2plus.onnx"
MODEL_ASSET_ID = "realesrgan-x2plus-v0.2.1"
WARMUP_COUNT = 1
MEASURED_COUNT = 3


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve_report_path(t32_dir: Path, relative: str) -> Path:
    path = (t32_dir / relative).resolve()
    try:
        path.relative_to(t32_dir.resolve())
    except ValueError as error:
        raise ValueError(f"Benchmark artifact path escapes T32 directory: {relative}") from error
    return path


def load_rgb(path: Path, expected_sha256: str, expected_size: dict[str, int]) -> np.ndarray:
    encoded = path.read_bytes()
    actual_hash = sha256_bytes(encoded)
    if actual_hash != expected_sha256:
        raise RuntimeError(
            f"PNG hash mismatch for {path.name}: expected={expected_sha256}, actual={actual_hash}"
        )
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    height, width, channels = rgb.shape
    if channels != 3 or width != expected_size["width"] or height != expected_size["height"]:
        raise RuntimeError(
            f"PNG dimensions mismatch for {path.name}: {width}x{height}, expected "
            f"{expected_size['width']}x{expected_size['height']} RGB"
        )
    return rgb


def make_nchw_input(rgb: np.ndarray) -> tuple[np.ndarray, dict[str, int]]:
    height, width, _ = rgb.shape
    pad_h = height % 2
    pad_w = width % 2
    if pad_h or pad_w:
        padded = np.pad(rgb, ((0, pad_h), (0, pad_w), (0, 0)), mode="reflect")
    else:
        padded = rgb
    nchw = np.transpose(padded.astype(np.float32) / np.float32(255.0), (2, 0, 1))[None, ...]
    return nchw, {"bottom": pad_h, "right": pad_w}


def gaussian_kernel(size: int = 11, sigma: float = 1.5) -> np.ndarray:
    radius = size // 2
    weights = np.array(
        [np.exp(-((index - radius) ** 2) / (2 * sigma * sigma)) for index in range(size)],
        dtype=np.float64,
    )
    return weights / weights.sum()


def gaussian_blur(values: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    radius = len(kernel) // 2
    height, width = values.shape
    horizontal_padded = np.pad(values, ((0, 0), (radius, radius)), mode="edge")
    horizontal = np.zeros((height, width), dtype=np.float64)
    for index, weight in enumerate(kernel):
        horizontal += horizontal_padded[:, index : index + width] * weight
    vertical_padded = np.pad(horizontal, ((radius, radius), (0, 0)), mode="edge")
    output = np.zeros((height, width), dtype=np.float64)
    for index, weight in enumerate(kernel):
        output += vertical_padded[index : index + height, :] * weight
    return output


def psnr_rgb(reference: np.ndarray, output: np.ndarray) -> float:
    if reference.shape != output.shape:
        raise ValueError(f"PSNR shape mismatch: {reference.shape} vs {output.shape}")
    difference = reference.astype(np.float64) - output.astype(np.float64)
    mse = float(np.square(difference).mean())
    return float("inf") if mse == 0 else 10.0 * np.log10((255.0 * 255.0) / mse)


def ssim_luminance(reference: np.ndarray, output: np.ndarray) -> float:
    if reference.shape != output.shape:
        raise ValueError(f"SSIM shape mismatch: {reference.shape} vs {output.shape}")
    a_rgb = reference.astype(np.float64)
    b_rgb = output.astype(np.float64)
    a = 0.299 * a_rgb[..., 0] + 0.587 * a_rgb[..., 1] + 0.114 * a_rgb[..., 2]
    b = 0.299 * b_rgb[..., 0] + 0.587 * b_rgb[..., 1] + 0.114 * b_rgb[..., 2]
    kernel = gaussian_kernel()
    mean_a = gaussian_blur(a, kernel)
    mean_b = gaussian_blur(b, kernel)
    mean_a2 = gaussian_blur(a * a, kernel)
    mean_b2 = gaussian_blur(b * b, kernel)
    mean_ab = gaussian_blur(a * b, kernel)
    variance_a = np.maximum(0.0, mean_a2 - mean_a * mean_a)
    variance_b = np.maximum(0.0, mean_b2 - mean_b * mean_b)
    covariance = mean_ab - mean_a * mean_b
    c1 = (0.01 * 255.0) ** 2
    c2 = (0.03 * 255.0) ** 2
    numerator = (2.0 * mean_a * mean_b + c1) * (2.0 * covariance + c2)
    denominator = (mean_a * mean_a + mean_b * mean_b + c1) * (variance_a + variance_b + c2)
    return float(np.mean(numerator / denominator))


def write_rgba_png(path: Path, rgb: np.ndarray) -> tuple[str, str]:
    rgba = np.empty((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = 255
    Image.fromarray(rgba).save(path, format="PNG", compress_level=9, optimize=False)
    return sha256_file(path), sha256_bytes(rgba.tobytes())


def nearest_rank(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    index = max(0, int(np.ceil(percentile * len(ordered))) - 1)
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(tempfile.gettempdir()) / "image-complianttools-t32-onnx" / MODEL_FILENAME,
    )
    parser.add_argument("--tier1-report", type=Path, default=TIER1_REPORT)
    parser.add_argument("--output-report", type=Path, default=T32_DIR / "model-results.json")
    parser.add_argument("--artifact-dir", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()

    model_path = args.model.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        model_path.relative_to(temp_root)
    except ValueError as error:
        raise ValueError(f"ONNX model must remain under OS temp: {model_path}") from error
    if not model_path.is_file():
        raise FileNotFoundError(f"Converted ONNX model not found: {model_path}")

    parity_report = json.loads(CPU_PARITY_REPORT.read_text(encoding="utf-8"))
    model_record = next(
        entry for entry in parity_report["models"] if entry["assetId"] == MODEL_ASSET_ID
    )
    model_size = model_path.stat().st_size
    model_hash = sha256_file(model_path)
    if model_size != model_record["onnxSizeBytes"] or model_hash != model_record["onnxSha256"]:
        raise RuntimeError(
            "ONNX asset differs from the checked-in CPU parity record: "
            f"bytes {model_size}/{model_record['onnxSizeBytes']}, "
            f"sha256 {model_hash}/{model_record['onnxSha256']}"
        )

    versions = {
        name: importlib.metadata.version(name)
        for name in ("onnxruntime", "numpy", "pillow")
    }
    if versions != {"onnxruntime": "1.20.1", "numpy": "2.5.3", "pillow": "12.3.0"}:
        raise RuntimeError(f"Benchmark toolchain version mismatch: {versions}")

    import onnxruntime as ort

    tier1 = json.loads(args.tier1_report.read_text(encoding="utf-8"))
    fixtures: list[dict[str, Any]] = tier1.get("fixtures", [])
    if len(fixtures) != 4:
        raise RuntimeError(f"Expected four T32 fixtures in {args.tier1_report}, found {len(fixtures)}")

    options = ort.SessionOptions()
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        str(model_path), sess_options=options, providers=["CPUExecutionProvider"]
    )
    if session.get_providers() != ["CPUExecutionProvider"]:
        raise RuntimeError(f"Unexpected ORT providers: {session.get_providers()}")
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    args.output_report.parent.mkdir(parents=True, exist_ok=True)

    measured_fixtures: list[dict[str, Any]] = []
    for fixture in fixtures:
        low = fixture["lowResolutionArtifact"]
        reference_artifact = fixture["referenceArtifact"]
        low_path = resolve_report_path(T32_DIR, low["path"])
        reference_path = resolve_report_path(T32_DIR, reference_artifact["path"])
        low_rgb = load_rgb(low_path, low["pngSha256"], low)
        reference_rgb = load_rgb(
            reference_path,
            reference_artifact["pngSha256"],
            reference_artifact,
        )
        if reference_rgb.shape[:2] != (low_rgb.shape[0] * 2, low_rgb.shape[1] * 2):
            raise RuntimeError(f"Scale-2 input/reference dimensions do not match for {fixture['id']}")

        model_input, pad = make_nchw_input(low_rgb)
        for _ in range(WARMUP_COUNT):
            session.run([output_name], {input_name: model_input})
        elapsed_ms: list[float] = []
        model_output = None
        for _ in range(MEASURED_COUNT):
            started = time.perf_counter()
            model_output = session.run([output_name], {input_name: model_input})[0]
            elapsed_ms.append((time.perf_counter() - started) * 1000.0)
        if model_output is None:
            raise RuntimeError("ONNX Runtime returned no output")

        expected_height = reference_rgb.shape[0]
        expected_width = reference_rgb.shape[1]
        output_float = model_output[0, :, : expected_height, : expected_width]
        output_rgb = np.rint(np.clip(np.transpose(output_float, (1, 2, 0)), 0.0, 1.0) * 255.0)
        output_rgb = output_rgb.astype(np.uint8)
        if output_rgb.shape != reference_rgb.shape:
            raise RuntimeError(
                f"Output dimensions mismatch for {fixture['id']}: {output_rgb.shape} vs "
                f"{reference_rgb.shape}"
            )

        output_filename = f"{fixture['id']}-realesrgan-x2plus.png"
        output_path = args.artifact_dir / output_filename
        output_png_hash, output_rgba_hash = write_rgba_png(output_path, output_rgb)
        samples = [round(value, 3) for value in elapsed_ms]
        measured_fixtures.append({
            "id": fixture["id"],
            "input": {
                "path": low["path"],
                "pngSha256": low["pngSha256"],
                "width": low["width"],
                "height": low["height"],
                "tensorShape": list(model_input.shape),
                "normalizedRgbRange": [0.0, 1.0],
                "reflectPadBottomRight": pad,
            },
            "reference": {
                "path": reference_artifact["path"],
                "pngSha256": reference_artifact["pngSha256"],
                "width": reference_artifact["width"],
                "height": reference_artifact["height"],
            },
            "output": {
                "path": f"artifacts/{output_filename}",
                "pngSha256": output_png_hash,
                "rgbaSha256": output_rgba_hash,
                "width": output_rgb.shape[1],
                "height": output_rgb.shape[0],
            },
            "quality": {
                "psnrRgbDb": round(psnr_rgb(reference_rgb, output_rgb), 4),
                "ssimLuminanceGaussian11x11": round(ssim_luminance(reference_rgb, output_rgb), 6),
            },
            "latency": {
                "samplesMs": samples,
                "medianMs": round(float(statistics.median(elapsed_ms)), 3),
                "p95MsNearestRank": round(nearest_rank(elapsed_ms, 0.95), 3),
                "warmups": WARMUP_COUNT,
                "measuredRuns": MEASURED_COUNT,
                "scope": "ORT session.run only; excludes PNG decode, tensor preparation, output conversion, metrics, and file writes.",
            },
        })
        print(f"completed {fixture['id']}: {output_rgb.shape[1]}x{output_rgb.shape[0]}")

    result = {
        "schemaVersion": 1,
        "benchmark": "P4-21 T32 Real-ESRGAN x2plus scale-2 reconstruction",
        "model": {
            "assetId": MODEL_ASSET_ID,
            "sourceFilename": model_record["sourceFilename"],
            "sourceSizeBytes": model_record["sourceSizeBytes"],
            "sourceSha256": model_record["sourceSha256"],
            "onnxFilename": MODEL_FILENAME,
            "onnxSizeBytes": model_size,
            "onnxSha256": model_hash,
            "opset": parity_report["onnx"]["opset"],
            "basicSRCommit": parity_report["basicSR"]["commit"],
        },
        "corpus": {
            "fixtureCount": len(measured_fixtures),
            "manifestSha256": tier1["corpusManifestSha256"],
            "tier1ReportSha256": sha256_file(args.tier1_report),
        },
        "runtime": {
            "python": __import__("sys").version.split()[0],
            "onnxruntime": versions["onnxruntime"],
            "provider": "CPUExecutionProvider",
            "providers": session.get_providers(),
            "intraOpThreads": options.intra_op_num_threads,
            "interOpThreads": options.inter_op_num_threads,
        },
        "methodology": {
            "input": "Read the exact low-resolution PNGs recorded in t32/results.json; convert to RGB; normalize float32 RGB to [0,1]; transpose to NCHW. For x2 pixel-unshuffle divisibility, reflect-pad only the bottom/right to even dimensions, run ONNX, then crop to the original scale-2 dimensions.",
            "output": "Clamp model output to [0,1], round to 8-bit RGB, save as lossless 8-bit RGBA PNG with alpha 255.",
            "psnr": tier1["qualityMethodology"]["psnr"],
            "ssim": tier1["qualityMethodology"]["ssim"],
            "latencyComparison": "CPU ONNX Runtime latency is not directly comparable with the prior Tier 1 Node.js CPU latency because the runtimes, execution kernels, and preprocessing paths differ. Both reports state their own timing boundary.",
        },
        "aggregateQuality": {
            "meanPsnrRgbDb": round(statistics.mean(row["quality"]["psnrRgbDb"] for row in measured_fixtures), 4),
            "meanSsimLuminanceGaussian11x11": round(
                statistics.mean(row["quality"]["ssimLuminanceGaussian11x11"] for row in measured_fixtures),
                6,
            ),
        },
        "fixtures": measured_fixtures,
    }
    args.output_report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"model results written to {args.output_report}")


if __name__ == "__main__":
    main()
