#!/usr/bin/env python3
"""Offline, hash-gated Real-ESRGAN checkpoint conversion and CPU parity check."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import tempfile
import types
from typing import Any


BASICSR_COMMIT = "651835a1b9d38dbbdaf45750f56906be2364f01a"
EXPECTED_VERSIONS = {
    "torch": "2.5.1+cpu",
    "torchvision": "0.20.1+cpu",
    "onnx": "1.17.0",
    "onnxruntime": "1.20.1",
    "basicsr": "1.4.2",
}
OPSET = 17
PARITY_ATOL = 1e-4
PARITY_RTOL = 1e-4
INPUT_SHAPES = ((1, 3, 8, 12), (1, 3, 10, 14))
ASSET_IDS = {
    "RealESRGAN_x4plus.pth": ("realesrgan-x4plus-v0.1.0", 4),
    "RealESRGAN_x2plus.pth": ("realesrgan-x2plus-v0.2.1", 2),
}


def repository_root() -> Path:
    return Path(__file__).resolve().parents[6]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def package_versions() -> dict[str, str]:
    actual = {name: importlib.metadata.version(name) for name in EXPECTED_VERSIONS}
    mismatches = {
        name: {"expected": expected, "actual": actual[name]}
        for name, expected in EXPECTED_VERSIONS.items()
        if actual[name] != expected
    }
    if mismatches:
        raise RuntimeError(f"Conversion toolchain version mismatch: {mismatches}")

    direct_url = importlib.metadata.distribution("basicsr").read_text("direct_url.json")
    if not direct_url:
        raise RuntimeError("BasicSR direct_url.json is missing; require the pinned VCS source")
    commit_id = json.loads(direct_url).get("vcs_info", {}).get("commit_id")
    if commit_id != BASICSR_COMMIT:
        raise RuntimeError(
            f"BasicSR source revision mismatch: expected {BASICSR_COMMIT}, got {commit_id}"
        )
    return actual


def load_registry(manifest_path: Path) -> dict[str, dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = manifest.get("assets")
    if not isinstance(assets, list):
        raise RuntimeError(f"Malformed model asset register: {manifest_path}")
    by_filename = {entry.get("filename"): entry for entry in assets}
    for filename, (asset_id, scale) in ASSET_IDS.items():
        entry = by_filename.get(filename)
        if not entry or entry.get("id") != asset_id:
            raise RuntimeError(f"Register entry missing or mismatched for {filename}")
        architecture = entry.get("architecture") or {}
        expected_architecture = {
            "name": "RRDBNet",
            "scale": scale,
            "blocks": 23,
            "features": 64,
            "growthChannels": 32,
        }
        if architecture != expected_architecture:
            raise RuntimeError(
                f"Architecture register mismatch for {filename}: {architecture}"
            )
        if not isinstance(entry.get("sizeBytes"), int) or len(entry.get("sha256", "")) != 64:
            raise RuntimeError(f"Size or SHA-256 missing from register entry for {filename}")
    return by_filename


def checked_checkpoints(cache_dir: Path, entries: dict[str, dict[str, Any]]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for filename in ASSET_IDS:
        path = cache_dir / filename
        entry = entries[filename]
        if not path.is_file():
            raise FileNotFoundError(
                f"Cached checkpoint is missing: {path}. Fetch it separately, then rerun conversion."
            )
        actual_size = path.stat().st_size
        if actual_size != entry["sizeBytes"]:
            raise RuntimeError(
                f"Size mismatch for {filename}: register={entry['sizeBytes']} file={actual_size}"
            )
        actual_sha256 = sha256_file(path)
        if actual_sha256 != entry["sha256"].lower():
            raise RuntimeError(
                f"SHA-256 mismatch for {filename}: register={entry['sha256']} file={actual_sha256}"
            )
        result[filename] = path
    return result


def require_temp_output(path: Path) -> Path:
    resolved = path.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        resolved.relative_to(temp_root)
    except ValueError as error:
        raise ValueError(f"Output path must stay under OS temp ({temp_root}): {resolved}") from error
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def import_upstream_rrdbnet():
    # BasicSR v1.4.2 imports this module during package discovery. It was removed
    # in torchvision 0.17; the only use is the same functional API operation.
    import torchvision.transforms.functional as functional

    compatibility_module = types.ModuleType("torchvision.transforms.functional_tensor")
    compatibility_module.rgb_to_grayscale = functional.rgb_to_grayscale
    sys.modules.setdefault("torchvision.transforms.functional_tensor", compatibility_module)

    from basicsr.archs.rrdbnet_arch import RRDBNet

    return RRDBNet


def load_model(checkpoint_path: Path, scale: int, torch):
    RRDBNet = import_upstream_rrdbnet()
    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=scale,
    )
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if not isinstance(checkpoint, dict):
        raise RuntimeError(f"Unexpected checkpoint container: {checkpoint_path}")
    parameters = checkpoint.get("params_ema", checkpoint.get("params"))
    if not isinstance(parameters, dict):
        raise RuntimeError(f"Checkpoint has neither params_ema nor params: {checkpoint_path}")
    model.load_state_dict(parameters, strict=True)
    return model.cpu().eval()


def convert_one(
    filename: str,
    checkpoint_path: Path,
    entry: dict[str, Any],
    output_dir: Path,
    torch,
    onnx,
    ort,
) -> dict[str, Any]:
    asset_id, scale = ASSET_IDS[filename]
    model = load_model(checkpoint_path, scale, torch)
    onnx_path = output_dir / filename.replace(".pth", ".onnx")
    example = torch.zeros(INPUT_SHAPES[0], dtype=torch.float32)
    torch.onnx.export(
        model,
        (example,),
        str(onnx_path),
        export_params=True,
        opset_version=OPSET,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {2: "height", 3: "width"},
            "output": {2: "scaled_height", 3: "scaled_width"},
        },
        dynamo=False,
    )

    graph = onnx.load(str(onnx_path), load_external_data=True)
    onnx.checker.check_model(graph)
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    parity_results = []
    for seed, shape in enumerate(INPUT_SHAPES, start=20260919):
        generator = torch.Generator(device="cpu").manual_seed(seed)
        sample = torch.rand(shape, generator=generator, dtype=torch.float32)
        with torch.inference_mode():
            expected = model(sample).cpu().numpy()
        actual = session.run([output_name], {input_name: sample.numpy()})[0]
        import numpy as np

        if actual.shape != (shape[0], 3, shape[2] * scale, shape[3] * scale):
            raise RuntimeError(
                f"Unexpected ONNX output shape for {filename}: {actual.shape} at input {shape}"
            )
        absolute_error = np.abs(expected - actual)
        max_abs_error = float(absolute_error.max(initial=0.0))
        mean_abs_error = float(absolute_error.mean())
        if not np.allclose(expected, actual, atol=PARITY_ATOL, rtol=PARITY_RTOL):
            raise RuntimeError(
                f"CPU parity failed for {filename}, shape={shape}: "
                f"max_abs={max_abs_error:.8g}, mean_abs={mean_abs_error:.8g}"
            )
        parity_results.append({
            "inputShape": list(shape),
            "outputShape": list(actual.shape),
            "seed": seed,
            "maxAbsError": max_abs_error,
            "meanAbsError": mean_abs_error,
            "atol": PARITY_ATOL,
            "rtol": PARITY_RTOL,
        })

    return {
        "assetId": asset_id,
        "sourceFilename": filename,
        "sourceSizeBytes": checkpoint_path.stat().st_size,
        "sourceSha256": entry["sha256"],
        "scale": scale,
        "onnxFilename": onnx_path.name,
        "onnxSizeBytes": onnx_path.stat().st_size,
        "onnxSha256": sha256_file(onnx_path),
        "opset": OPSET,
        "providers": ["CPUExecutionProvider"],
        "parity": parity_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / "image-complianttools-models",
        help="Directory containing previously fetched .pth files; this script never fetches models.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / "image-complianttools-t32-onnx",
        help="OS-temp-only directory for ONNX models and report.json.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=repository_root() / "docs" / "model-assets.json",
    )
    args = parser.parse_args()

    versions = package_versions()
    entries = load_registry(args.manifest)
    checkpoints = checked_checkpoints(args.cache_dir, entries)
    output_dir = require_temp_output(args.output_dir)

    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch

    np.random.seed(20260919)
    torch.manual_seed(20260919)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)

    results = [
        convert_one(filename, checkpoints[filename], entries[filename], output_dir, torch, onnx, ort)
        for filename in ASSET_IDS
    ]
    report = {
        "schemaVersion": 1,
        "toolchain": versions,
        "pythonVersion": sys.version.split()[0],
        "basicsrSource": {
            "url": "https://github.com/XPixelGroup/BasicSR",
            "revision": BASICSR_COMMIT,
            "tag": "v1.4.2",
            "license": "Apache-2.0",
        },
        "architecture": {
            "name": "RRDBNet",
            "blocks": 23,
            "features": 64,
            "growthChannels": 32,
            "inputChannels": 3,
            "outputChannels": 3,
        },
        "results": results,
    }
    report_path = output_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Report written to OS temp: {report_path}")


if __name__ == "__main__":
    main()
