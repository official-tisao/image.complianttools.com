#!/usr/bin/env bash
set -euo pipefail

# Unique names avoid colliding with a developer's running web/Compose stack.
# docker exec probes work both on GitHub and with Docker Desktop's sibling daemon:
# localhost in a CI container is NOT the Docker host's published port.
run_id="${GITHUBCI_RUN_ID:-githubci-$(date +%s)-${RANDOM}}"
image="ctimg-web:${run_id}"
container="${run_id}-web"
env_container="${run_id}-web-env"
compose_container="${run_id}-compose-web"
override="$(mktemp --suffix=.yml)"
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker logs "$container" || true
    docker logs "$compose_container" || true
  fi
  docker rm -f "$container" "$env_container" "$compose_container" >/dev/null 2>&1 || true
  docker network rm "${run_id}-network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
  rm -f "$override"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_healthy() {
  local name="$1" state
  for _ in $(seq 1 60); do
    state="$(docker inspect --format '{{.State.Health.Status}}' "$name")"
    if [ "$state" = healthy ]; then return 0; fi
    sleep 1
  done
  echo "ERROR: $name did not become healthy ($state)" >&2
  return 1
}

probe() {
  docker exec "$1" sh -ec '
    wget -S -O /tmp/ci-index.html http://127.0.0.1/ 2>/tmp/ci-headers
    grep -q "HTTP/1.1 200" /tmp/ci-headers
    grep -q svelte /tmp/ci-index.html
    grep -Eiq "^[[:space:]]*Cross-Origin-Opener-Policy:[[:space:]]*same-origin[[:space:]]*$" /tmp/ci-headers
    grep -Eiq "^[[:space:]]*Cross-Origin-Embedder-Policy:[[:space:]]*require-corp[[:space:]]*$" /tmp/ci-headers
    wget -qO /dev/null http://127.0.0.1/ & first=$!
    wget -qO /dev/null http://127.0.0.1/ & second=$!
    wait "$first"
    wait "$second"
  '
}

docker version
docker compose version
docker buildx build --load -t "$image" -f Dockerfile .
docker image inspect "$image" --format 'Image size: {{.Size}} bytes'
docker run -d --name "$container" "$image"
wait_healthy "$container"
probe "$container"

# A deployer can swap the face model origin through container runtime ENV. The
# static runtime document carries a URL only; the container never downloads weights.
test_yunet_url="https://static.example.invalid/models/face_detection_yunet_2023mar.onnx"
docker run -d --name "$env_container" -e "T57_YUNET_MODEL_URL=$test_yunet_url" "$image"
wait_healthy "$env_container"
docker exec -e "EXPECTED_YUNET_URL=$test_yunet_url" "$env_container" sh -ec '
  config="$(wget -qO- http://127.0.0.1/t32-runtime-config.json)"
  expected="$(printf "%s" "$EXPECTED_YUNET_URL" | base64 | tr -d "\r\n")"
  printf "%s" "$config" | grep -Fq "\"yunetUrlBase64\": \"$expected\""
'

# Validate the real Compose file, overriding only run-specific deployment details.
# !reset requires Compose >=2.24.4 (included in Dockerfile.githubci).
printf 'services:\n  web:\n    image: %s\n    container_name: %s\n    ports: !reset []\n    restart: "no"\nnetworks:\n  default:\n    name: %s-network\n' \
  "$image" "$compose_container" "$run_id" > "$override"
docker compose -p "$run_id" -f docker-compose.yml -f "$override" config -q
docker compose -p "$run_id" -f docker-compose.yml -f "$override" up -d --no-build --pull never web
wait_healthy "$compose_container"
probe "$compose_container"
echo 'DOCKER_VALIDATE_OK: image, health, HTTP, security headers, concurrent requests, runtime model URL, Compose'
