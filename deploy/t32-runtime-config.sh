#!/bin/sh
set -eu

config_path=${T32_RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/t32-runtime-config.json}
x2_primary=${T32_ESRGAN_X2_URL:-https://huggingface.co/fernandotonon/QtMeshEditor-models/resolve/d14119a40dfeef208e4e724dfaceb2640d2df95b/RealESRGAN_x2plus.onnx}
x2_fallback=${T32_ESRGAN_X2_FALLBACK_URL:-}
x4_primary=${T32_ESRGAN_X4_URL:-https://huggingface.co/fernandotonon/QtMeshEditor-models/resolve/d14119a40dfeef208e4e724dfaceb2640d2df95b/RealESRGAN_x4plus.onnx}
x4_fallback=${T32_ESRGAN_X4_FALLBACK_URL:-}
yunet_model_url=${T57_YUNET_MODEL_URL:-https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/face_detection_yunet_2023mar.onnx}

encode_base64() {
  printf '%s' "$1" | base64 | tr -d '\r\n'
}

config_directory=$(dirname "$config_path")
mkdir -p "$config_directory"
temporary_path="${config_path}.tmp.$$"
trap 'rm -f "$temporary_path"' EXIT HUP INT TERM
umask 022

cat > "$temporary_path" <<EOF
{
  "schemaVersion": 1,
  "tier2": {
    "x2": {
      "primaryUrlBase64": "$(encode_base64 "$x2_primary")",
      "fallbackUrlBase64": "$(encode_base64 "$x2_fallback")"
    },
    "x4": {
      "primaryUrlBase64": "$(encode_base64 "$x4_primary")",
      "fallbackUrlBase64": "$(encode_base64 "$x4_fallback")"
    }
  },
  "faceDetection": {
    "yunetUrlBase64": "$(encode_base64 "$yunet_model_url")"
  }
}
EOF

chmod 0644 "$temporary_path"
mv -f "$temporary_path" "$config_path"
trap - EXIT HUP INT TERM
