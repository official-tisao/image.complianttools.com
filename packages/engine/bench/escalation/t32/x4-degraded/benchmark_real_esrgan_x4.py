#!/usr/bin/env python3
"""Measure Real-ESRGAN x4 on reproducible CC0-derived synthetic degradations."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import statistics
import sys
import tempfile
import time
from typing import Any

import numpy as np
from PIL import Image


BENCH_DIR = Path(__file__).resolve().parent
T32_DIR = BENCH_DIR.parent
MODEL_REGISTER = T32_DIR.parents[4] / "docs" / "model-assets.json"
FIXTURES = BENCH_DIR / "fixtures.json"
ARTIFACT_DIR = BENCH_DIR / "artifacts"
MODEL_FILENAME = "RealESRGAN_x4plus.onnx"
ASSET_ID = "realesrgan-x4plus-v0.1.0"
SCALE = 4
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


def resolve_artifact(relative: str) -> Path:
    path = (BENCH_DIR / relative).resolve()
    try:
        path.relative_to(BENCH_DIR.resolve())
    except ValueError as error:
        raise ValueError(f"Fixture artifact path escapes the x4 benchmark directory: {relative}") from error
    return path


def load_rgb(relative: str, expected_hash: str, expected_width: int, expected_height: int) -> np.ndarray:
    path = resolve_artifact(relative)
    encoded = path.read_bytes()
    actual_hash = sha256_bytes(encoded)
    if actual_hash != expected_hash:
        raise RuntimeError(f"PNG SHA-256 mismatch for {relative}: {actual_hash} != {expected_hash}")
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    height, width, channels = rgb.shape
    if channels != 3 or width != expected_width or height != expected_height:
        raise RuntimeError(
            f"PNG dimensions mismatch for {relative}: {width}x{height}; "
            f"expected {expected_width}x{expected_height} RGB"
        )
    return rgb


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


def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    methods = {
        "tier1Lanczos3": [row["quality"]["tier1Lanczos3"] for row in rows],
        "realEsrganX4plus": [row["quality"]["realEsrganX4plus"] for row in rows],
    }
    result: dict[str, Any] = {}
    for method, values in methods.items():
        result[method] = {
            "sampleCount": len(values),
            "meanPsnrRgbDb": round(statistics.mean(value["psnrRgbDb"] for value in values), 4),
            "meanSsimLuminanceGaussian11x11": round(
                statistics.mean(value["ssimLuminanceGaussian11x11"] for value in values), 6
            ),
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(tempfile.gettempdir()) / "image-complianttools-t32-onnx" / MODEL_FILENAME,
    )
    parser.add_argument("--output-report", type=Path, default=BENCH_DIR / "results.json")
    parser.add_argument("--artifact-dir", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()

    model_path = args.model.resolve()
    try:
        model_path.relative_to(Path(tempfile.gettempdir()).resolve())
    except ValueError as error:
        raise ValueError(f"ONNX model must remain under OS temp: {model_path}") from error
    if not model_path.is_file():
        raise FileNotFoundError(f"Converted ONNX model not found: {model_path}")

    model_register = json.loads(MODEL_REGISTER.read_text(encoding="utf-8"))
    model_record = next(row for row in model_register["assets"] if row["id"] == ASSET_ID)
    conversion = model_record["onnxConversion"]
    model_size = model_path.stat().st_size
    model_hash = sha256_file(model_path)
    if model_size != conversion["sizeBytes"] or model_hash != conversion["sha256"]:
        raise RuntimeError(
            "ONNX asset differs from docs/model-assets.json: "
            f"size={model_size}/{conversion['sizeBytes']}, sha256={model_hash}/{conversion['sha256']}"
        )

    versions = {
        name: importlib.metadata.version(name)
        for name in ("onnxruntime", "numpy", "pillow")
    }
    expected_versions = {"onnxruntime": "1.20.1", "numpy": "2.5.3", "pillow": "12.3.0"}
    if versions != expected_versions:
        raise RuntimeError(f"Benchmark toolchain version mismatch: {versions} != {expected_versions}")

    import onnxruntime as ort

    fixture_register = json.loads(FIXTURES.read_text(encoding="utf-8"))
    if fixture_register.get("fixtureCount") != 16 or len(fixture_register.get("fixtures", [])) != 16:
        raise RuntimeError("Expected four CC0 sources x four registered degradation cases.")

    options = ort.SessionOptions()
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
    if session.get_providers() != ["CPUExecutionProvider"]:
        raise RuntimeError(f"Unexpected ORT providers: {session.get_providers()}")
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    args.artifact_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    all_samples_ms: list[float] = []
    for fixture in fixture_register["fixtures"]:
        reference_record = fixture["reference"]
        input_record = fixture["input"]
        tier1_record = fixture["tier1Lanczos3"]
        reference = load_rgb(
            reference_record["path"],
            reference_record["pngSha256"],
            reference_record["width"],
            reference_record["height"],
        )
        low = load_rgb(
            input_record["path"],
            input_record["pngSha256"],
            input_record["width"],
            input_record["height"],
        )
        tier1 = load_rgb(
            tier1_record["path"],
            tier1_record["pngSha256"],
            tier1_record["width"],
            tier1_record["height"],
        )
        if reference.shape[:2] != (low.shape[0] * SCALE, low.shape[1] * SCALE):
            raise RuntimeError(f"x4 dimensions do not match for {fixture['id']}.")
        if tier1.shape != reference.shape:
            raise RuntimeError(f"Tier 1 output dimensions do not match reference for {fixture['id']}.")

        model_input = np.transpose(low.astype(np.float32) / np.float32(255.0), (2, 0, 1))[None, ...]
        for _ in range(WARMUP_COUNT):
            session.run([output_name], {input_name: model_input})
        elapsed_ms: list[float] = []
        model_output = None
        for _ in range(MEASURED_COUNT):
            started = time.perf_counter()
            model_output = session.run([output_name], {input_name: model_input})[0]
            elapsed_ms.append((time.perf_counter() - started) * 1000.0)
        all_samples_ms.extend(elapsed_ms)
        if model_output is None or model_output.shape != (1, 3, reference.shape[0], reference.shape[1]):
            actual_shape = None if model_output is None else model_output.shape
            raise RuntimeError(f"Unexpected Real-ESRGAN x4 output shape for {fixture['id']}: {actual_shape}")

        output_rgb = np.rint(np.clip(np.transpose(model_output[0], (1, 2, 0)), 0.0, 1.0) * 255.0)
        output_rgb = output_rgb.astype(np.uint8)
        output_filename = f"{fixture['id']}-realesrgan-x4plus.png"
        output_path = args.artifact_dir / output_filename
        output_png_hash, output_rgba_hash = write_rgba_png(output_path, output_rgb)
        latency = {
            "samplesMs": [round(value, 3) for value in elapsed_ms],
            "medianMs": round(float(statistics.median(elapsed_ms)), 3),
            "p95MsNearestRank": round(nearest_rank(elapsed_ms, 0.95), 3),
            "warmups": WARMUP_COUNT,
            "measuredRuns": MEASURED_COUNT,
            "scope": "ONNX Runtime CPU session.run only; excludes PNG decode, tensor preparation, output conversion, metrics, and file writes.",
        }
        quality = {
            "tier1Lanczos3": {
                "psnrRgbDb": round(psnr_rgb(reference, tier1), 4),
                "ssimLuminanceGaussian11x11": round(ssim_luminance(reference, tier1), 6),
            },
            "realEsrganX4plus": {
                "psnrRgbDb": round(psnr_rgb(reference, output_rgb), 4),
                "ssimLuminanceGaussian11x11": round(ssim_luminance(reference, output_rgb), 6),
            },
        }
        rows.append({
            "id": fixture["id"],
            "degradationCase": fixture["degradationCase"],
            "sourceAssetId": fixture["sourceAssetId"],
            "sourceSha256": fixture["sourceSha256"],
            "degradation": fixture["degradation"],
            "reference": reference_record,
            "input": input_record,
            "tier1Lanczos3": tier1_record,
            "modelOutput": {
                "path": f"artifacts/{output_filename}",
                "width": output_rgb.shape[1],
                "height": output_rgb.shape[0],
                "pngSha256": output_png_hash,
                "rgbaSha256": output_rgba_hash,
            },
            "quality": quality,
            "latency": latency,
        })
        print(
            f"completed {fixture['id']}: "
            f"Tier1 PSNR {quality['tier1Lanczos3']['psnrRgbDb']:.4f} dB, "
            f"model PSNR {quality['realEsrganX4plus']['psnrRgbDb']:.4f} dB, "
            f"median {latency['medianMs']:.1f} ms"
        )

    by_degradation: dict[str, Any] = {}
    for fixture in rows:
        category = fixture["degradationCase"]
        by_degradation.setdefault(category, []).append(fixture)
    per_category = {
        category: {
            "fixtureCount": len(category_rows),
            "tier1Lanczos3": {
                "meanPsnrRgbDb": round(
                    statistics.mean(row["quality"]["tier1Lanczos3"]["psnrRgbDb"] for row in category_rows), 4
                ),
                "meanSsimLuminanceGaussian11x11": round(
                    statistics.mean(row["quality"]["tier1Lanczos3"]["ssimLuminanceGaussian11x11"] for row in category_rows), 6
                ),
            },
            "realEsrganX4plus": {
                "meanPsnrRgbDb": round(
                    statistics.mean(row["quality"]["realEsrganX4plus"]["psnrRgbDb"] for row in category_rows), 4
                ),
                "meanSsimLuminanceGaussian11x11": round(
                    statistics.mean(row["quality"]["realEsrganX4plus"]["ssimLuminanceGaussian11x11"] for row in category_rows), 6
                ),
            },
        }
        for category, category_rows in by_degradation.items()
    }
    result = {
        "schemaVersion": 1,
        "benchmark": "P4-21 T32 Real-ESRGAN x4plus on CC0-derived synthetic x4 degradation fixtures",
        "model": {
            "assetId": ASSET_ID,
            "sourceFilename": model_record["filename"],
            "sourceSizeBytes": model_record["sizeBytes"],
            "sourceSha256": model_record["sha256"],
            "onnxFilename": MODEL_FILENAME,
            "onnxSizeBytes": model_size,
            "onnxSha256": model_hash,
            "onnxOpset": conversion["opset"],
            "conversionTool": conversion["converter"],
        },
        "corpus": {
            "fixtureCount": len(rows),
            "sourceCount": 4,
            "fixtureManifestSha256": sha256_file(FIXTURES),
            "sourceManifestSha256": fixture_register["generator"]["sourceManifestSha256"],
            "categories": list(by_degradation),
        },
        "runtime": {
            "python": sys.version.split()[0],
            **versions,
            "provider": "CPUExecutionProvider",
            "providers": session.get_providers(),
            "intraOpThreads": options.intra_op_num_threads,
            "interOpThreads": options.inter_op_num_threads,
        },
        "methodology": {
            "modelInput": "Read each exact x4 input PNG, convert RGB to float32 [0,1], transpose HWC to NCHW, run the registered Real-ESRGAN x4plus ONNX model, clamp to [0,1], round to 8-bit RGB, and save as lossless RGBA PNG.",
            "quality": "PSNR uses exact RGB channel MSE. SSIM uses Rec.601 luminance, an 11x11 Gaussian window (sigma 1.5), constants C1=(0.01*255)^2 and C2=(0.03*255)^2, edge-clamped extension, and full-resolution centers.",
            "latency": f"One warmup plus {MEASURED_COUNT} timed inference runs per fixture; CPU ONNX Runtime session.run only. p95 across {len(rows) * MEASURED_COUNT} individual runs uses nearest-rank; runtimes are not directly comparable to browser WASM or WebGPU.",
            "limits": "These are controlled synthetic degradations of four individually registered CC0 source images, not real camera captures or a statistically representative restoration benchmark. Results support only the listed x4 synthetic cases.",
        },
        "aggregateQuality": aggregate(rows),
        "latency": {
            "sessionRunMedianMs": round(float(statistics.median(all_samples_ms)), 3),
            "sessionRunP95MsNearestRank": round(nearest_rank(all_samples_ms, 0.95), 3),
            "sampleCount": len(all_samples_ms),
        },
        "byDegradation": per_category,
        "fixtures": rows,
    }
    args.output_report.parent.mkdir(parents=True, exist_ok=True)
    args.output_report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"results written to {args.output_report}")


if __name__ == "__main__":
    main()
