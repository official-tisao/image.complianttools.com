#!/usr/bin/env python3
"""Evaluate the pinned, publisher-declared Apache Swin2SR q4f16 x4 candidate."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
from pathlib import Path
import statistics
import sys
import tempfile
import time
from typing import Any

import numpy as np

from benchmark_real_esrgan_x4 import (
    FIXTURES,
    MODEL_REGISTER,
    BENCH_DIR,
    load_rgb,
    nearest_rank,
    psnr_rgb,
    sha256_file,
    ssim_luminance,
    write_rgba_png,
)


ASSET_ID = "swin2sr-realworld-x4-q4f16-onnx-9b3baf0"
SCALE = 4
WARMUP_COUNT = 1
MEASURED_COUNT = 3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(tempfile.gettempdir()) / "image-complianttools-swin2sr-x4-q4f16.onnx",
    )
    parser.add_argument("--output-report", type=Path, default=BENCH_DIR / "results-swin2sr.json")
    parser.add_argument(
        "--artifact-dir", type=Path, default=BENCH_DIR / "artifacts" / "swin2sr-q4f16"
    )
    parser.add_argument("--limit", type=int, help="Run only the first N fixtures as a development smoke.")
    args = parser.parse_args()

    model_path = args.model.resolve()
    try:
        model_path.relative_to(Path(tempfile.gettempdir()).resolve())
    except ValueError as error:
        raise ValueError(f"ONNX model must remain under OS temp: {model_path}") from error
    if not model_path.is_file():
        raise FileNotFoundError(f"Candidate ONNX model not found: {model_path}")

    registry = json.loads(MODEL_REGISTER.read_text(encoding="utf-8"))
    model_record = next(row for row in registry["assets"] if row["id"] == ASSET_ID)
    artifact = model_record["onnxConversion"]
    model_size = model_path.stat().st_size
    model_hash = sha256_file(model_path)
    if model_size != artifact["sizeBytes"] or model_hash != artifact["sha256"]:
        raise RuntimeError(
            "Swin2SR ONNX differs from docs/model-assets.json: "
            f"size={model_size}/{artifact['sizeBytes']}, sha256={model_hash}/{artifact['sha256']}"
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
    fixtures: list[dict[str, Any]] = fixture_register["fixtures"]
    if args.limit is not None:
        if args.limit < 1:
            raise ValueError("--limit must be positive.")
        fixtures = fixtures[: args.limit]
    if not fixtures:
        raise RuntimeError("No x4 fixtures were selected.")

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
    if input_name != "pixel_values" or output_name != "reconstruction":
        raise RuntimeError(f"Unexpected Swin2SR tensors: {input_name} -> {output_name}")

    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    all_samples_ms: list[float] = []
    window_multiple = model_record["architecture"]["windowSize"]

    for fixture in fixtures:
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
            raise RuntimeError(f"Tier 1 dimensions do not match for {fixture['id']}.")

        height, width, _ = low.shape
        pad_bottom = (-height) % window_multiple
        pad_right = (-width) % window_multiple
        if pad_bottom or pad_right:
            padded = np.pad(
                low,
                ((0, pad_bottom), (0, pad_right), (0, 0)),
                mode="reflect",
            )
        else:
            padded = low
        padded_filename = f"{fixture['id']}-swin2sr-padded-input.png"
        padded_png_hash, padded_rgba_hash = write_rgba_png(
            args.artifact_dir / padded_filename, padded
        )
        model_input = np.transpose(
            padded.astype(np.float32) / np.float32(255.0), (2, 0, 1)
        )[None, ...]
        for _ in range(WARMUP_COUNT):
            session.run([output_name], {input_name: model_input})
        elapsed_ms: list[float] = []
        model_output = None
        for _ in range(MEASURED_COUNT):
            started = time.perf_counter()
            model_output = session.run([output_name], {input_name: model_input})[0]
            elapsed_ms.append((time.perf_counter() - started) * 1000.0)
        all_samples_ms.extend(elapsed_ms)
        expected_shape = (1, 3, padded.shape[0] * SCALE, padded.shape[1] * SCALE)
        if model_output is None or model_output.shape != expected_shape:
            actual_shape = None if model_output is None else model_output.shape
            raise RuntimeError(
                f"Unexpected Swin2SR output for {fixture['id']}: {actual_shape} != {expected_shape}"
            )

        output_float = model_output[0, :, : reference.shape[0], : reference.shape[1]]
        output_rgb = np.rint(
            np.clip(np.transpose(output_float, (1, 2, 0)), 0.0, 1.0) * 255.0
        ).astype(np.uint8)
        filename = f"{fixture['id']}-swin2sr-q4f16-x4.png"
        output_png_hash, output_rgba_hash = write_rgba_png(args.artifact_dir / filename, output_rgb)
        quality = {
            "tier1Lanczos3": {
                "psnrRgbDb": round(psnr_rgb(reference, tier1), 4),
                "ssimLuminanceGaussian11x11": round(ssim_luminance(reference, tier1), 6),
            },
            "swin2srQ4f16": {
                "psnrRgbDb": round(psnr_rgb(reference, output_rgb), 4),
                "ssimLuminanceGaussian11x11": round(ssim_luminance(reference, output_rgb), 6),
            },
        }
        latency = {
            "samplesMs": [round(value, 3) for value in elapsed_ms],
            "medianMs": round(float(statistics.median(elapsed_ms)), 3),
            "p95MsNearestRank": round(nearest_rank(elapsed_ms, 0.95), 3),
            "warmups": WARMUP_COUNT,
            "measuredRuns": MEASURED_COUNT,
            "scope": "ONNX Runtime CPU session.run only; excludes fixture decode, window padding, tensor preparation, cropping, output conversion, metrics, and file writes.",
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
            "modelInput": {
                "tensorShape": list(model_input.shape),
                "reflectPadBottomRight": {"bottom": pad_bottom, "right": pad_right},
                "paddedInputArtifact": {
                    "path": f"artifacts/swin2sr-q4f16/{padded_filename}",
                    "width": padded.shape[1],
                    "height": padded.shape[0],
                    "pngSha256": padded_png_hash,
                    "rgbaSha256": padded_rgba_hash,
                },
            },
            "modelOutput": {
                "path": f"artifacts/swin2sr-q4f16/{filename}",
                "width": output_rgb.shape[1],
                "height": output_rgb.shape[0],
                "pngSha256": output_png_hash,
                "rgbaSha256": output_rgba_hash,
            },
            "quality": quality,
            "latency": latency,
        })
        print(
            f"completed {fixture['id']}: Tier 1 PSNR {quality['tier1Lanczos3']['psnrRgbDb']:.4f} dB, "
            f"Swin2SR PSNR {quality['swin2srQ4f16']['psnrRgbDb']:.4f} dB, "
            f"median {latency['medianMs']:.1f} ms"
        )

    def mean_metric(method: str, metric: str, category_rows: list[dict[str, Any]]) -> float:
        return statistics.mean(row["quality"][method][metric] for row in category_rows)

    by_degradation: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_degradation.setdefault(row["degradationCase"], []).append(row)
    category_summary = {}
    for category, category_rows in by_degradation.items():
        category_summary[category] = {
            "fixtureCount": len(category_rows),
            "methods": {
                method: {
                    "meanPsnrRgbDb": round(mean_metric(method, "psnrRgbDb", category_rows), 4),
                    "meanSsimLuminanceGaussian11x11": round(
                        mean_metric(method, "ssimLuminanceGaussian11x11", category_rows), 6
                    ),
                }
                for method in ("tier1Lanczos3", "swin2srQ4f16")
            },
        }
    aggregate = {
        method: {
            "fixtureCount": len(rows),
            "meanPsnrRgbDb": round(mean_metric(method, "psnrRgbDb", rows), 4),
            "meanSsimLuminanceGaussian11x11": round(
                mean_metric(method, "ssimLuminanceGaussian11x11", rows), 6
            ),
        }
        for method in ("tier1Lanczos3", "swin2srQ4f16")
    }
    output = {
        "schemaVersion": 1,
        "benchmark": "P4-21 T32 ONNX Community Swin2SR q4f16 x4 candidate on CC0-derived synthetic degradation fixtures",
        "evaluationOnly": True,
        "assetId": ASSET_ID,
        "model": {
            "filename": model_record["filename"],
            "sizeBytes": model_size,
            "sha256": model_hash,
            "repositoryRevision": model_record["release"],
            "license": model_record["license"],
            "licenseEvidenceUrl": model_record["licenseEvidenceUrl"],
            "baseModel": model_record["baseModel"],
            "scale": SCALE,
            "windowMultiple": window_multiple,
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
            "input": "Read the exact PNG fixtures; pad bottom/right with reflection to an 8-pixel window multiple; normalize RGB to float32 [0,1]; transpose HWC to NCHW; run the pinned x4 model; crop only the padded output; clamp/round to 8-bit RGB.",
            "comparison": "The exact engine Tier 1 Lanczos3 output and the candidate model receive the same saved input PNG. PSNR/SSIM definitions are the same as the paired Real-ESRGAN benchmark.",
            "latency": "One warmup plus three timed CPU inference calls per fixture. This CPU runtime does not establish browser WASM/WebGPU latency; the separate browser smoke is recorded in docs/model-assets.json.",
            "limits": "Four CC0 photos and four generated degradation recipes are a small synthetic set, not actual camera captures or a representative restoration corpus. The candidate remains evaluation-only; model-card Apache declaration is recorded, no separate per-file license notice was found, and training-data provenance is unspecified.",
        },
        "aggregateQuality": aggregate,
        "latency": {
            "sessionRunMedianMs": round(float(statistics.median(all_samples_ms)), 3),
            "sessionRunP95MsNearestRank": round(nearest_rank(all_samples_ms, 0.95), 3),
            "sampleCount": len(all_samples_ms),
        },
        "byDegradation": category_summary,
        "fixtures": rows,
    }
    args.output_report.parent.mkdir(parents=True, exist_ok=True)
    args.output_report.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"results written to {args.output_report}")


if __name__ == "__main__":
    main()
