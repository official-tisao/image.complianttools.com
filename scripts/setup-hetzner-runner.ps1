#requires -Version 7.0
<#
.SYNOPSIS
Generate and deploy the repository's persistent GitHub Actions runner over SSH.
.EXAMPLE
pwsh -File scripts/setup-hetzner-runner.ps1
.EXAMPLE
pwsh -File scripts/setup-hetzner-runner.ps1 -EnvironmentSource Local
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$')]
    [string]$SshHost = 'hetzner_vps_1',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_./-]*$')]
    [string]$RemoteDirectory = 'deploy/hetzner-github-runner',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../.cache/hetzner-github-runner'),
    [ValidateSet('Auto', 'Local', 'Remote')]
    [string]$EnvironmentSource = 'Auto',
    [switch]$GenerateOnly
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($RemoteDirectory.Split('/') -contains '..') {
    throw 'RemoteDirectory must stay within the SSH user home directory.'
}

# Single-quoted here-strings preserve Bash $variables and Docker syntax verbatim.
$dockerfile = @'
# syntax=docker/dockerfile:1
FROM docker:29.2.1-cli AS docker
FROM ubuntu:24.04
ARG RUNNER_VERSION
ARG RUNNER_SHA256
ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_TOOL_CACHE=/opt/hostedtoolcache \
    AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache \
    RUNNER_MANUALLY_TRAP_SIG=1 \
    CHROME_PATH=/usr/bin/google-chrome \
    LHCI_COLLECT__SETTINGS__CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage"
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/lib/docker/cli-plugins/
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git build-essential python3 python3-yaml rsync unzip zip \
    xz-utils sudo jq libicu74 libssl3 zlib1g libkrb5-3 liblttng-ust1 libunwind8 \
    && curl -fsSL --retry 3 https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
    && apt-get install -y --no-install-recommends /tmp/chrome.deb \
    && rm -f /tmp/chrome.deb && rm -rf /var/lib/apt/lists/*
# Ubuntu already owns UID 1000; choose a dedicated, unprivileged runner account.
RUN useradd --create-home --uid 1001 --shell /bin/bash runner \
    && printf 'runner ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/runner \
    && chmod 0440 /etc/sudoers.d/runner \
    && mkdir -p /opt/actions-runner /runner /opt/hostedtoolcache \
    && chown runner:runner /runner /opt/hostedtoolcache
RUN test -n "$RUNNER_VERSION" && test -n "$RUNNER_SHA256" \
    && curl -fsSL --retry 3 "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" -o /tmp/runner.tar.gz \
    && printf '%s  /tmp/runner.tar.gz\n' "$RUNNER_SHA256" | sha256sum -c - \
    && tar xzf /tmp/runner.tar.gz -C /opt/actions-runner \
    && rm /tmp/runner.tar.gz
COPY --chmod=755 entrypoint.sh /usr/local/bin/runner-entrypoint
USER runner
WORKDIR /runner
ENTRYPOINT ["/usr/local/bin/runner-entrypoint"]
'@

$entrypoint = @'
#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /runner

# Keep the installed runner, its updates, registration and work directory in a volume.
if [[ ! -x ./config.sh ]]; then
    cp -R /opt/actions-runner/. .
fi

repo_url="${IMAGE_COMPLIANTTOOLS_COM_REPO_URL:?Repository URL is required}"
if [[ ! -f .runner ]]; then
    : "${IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN:?A fresh registration token is required}"
    # The runner accepts configuration through environment variables; no token in argv.
    export ACTIONS_RUNNER_INPUT_TOKEN="$IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN"
    ./config.sh --unattended --url "$repo_url" \
        --name runner-compliant-tools --labels hetzner,compliant-tools --work _work
    unset ACTIONS_RUNNER_INPUT_TOKEN
else
    python3 - "$repo_url" <<'PY'
import json, sys
from pathlib import Path
registered = json.loads(Path('.runner').read_text(encoding='utf-8-sig'))['gitHubUrl'].rstrip('/')
if registered.lower() != sys.argv[1].rstrip('/').lower():
    raise SystemExit('Existing runner belongs to a different repository; refusing to reuse it.')
PY
fi

# Registration tokens expire; normal restarts use the saved runner credentials.
unset IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN
exec ./run.sh
'@

$deploy = @'
#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"

[[ "$(uname -m)" == x86_64 ]] || { echo 'This runner image requires an x86_64 VPS.' >&2; exit 1; }
[[ -S /var/run/docker.sock ]] || { echo 'Docker socket is unavailable.' >&2; exit 1; }
docker info >/dev/null
# Prevent two deployments from replacing the same container at the same time.
exec 9>.deploy.lock
flock -n 9 || { echo 'Another runner deployment is in progress.' >&2; exit 1; }

# Trim the VPS variables (including a pasted trailing space in REPO_URL).
export IMAGE_COMPLIANTTOOLS_COM_REPO_URL
export IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN
IMAGE_COMPLIANTTOOLS_COM_REPO_URL="$(python3 -c 'import os; print(os.getenv("IMAGE_COMPLIANTTOOLS_COM_REPO_URL", "").strip().rstrip("/"))')"
IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN="$(python3 -c 'import os; print(os.getenv("IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN", "").strip())')"
python3 - <<'PY'
import os, re
url = os.environ['IMAGE_COMPLIANTTOOLS_COM_REPO_URL']
token = os.environ['IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN']
if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', url):
    raise SystemExit('Set IMAGE_COMPLIANTTOOLS_COM_REPO_URL to https://github.com/OWNER/REPO.')
if not token or any(c.isspace() for c in token):
    raise SystemExit('Set IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN to a registration token.')
PY

# Resolve the official current release and verify its published SHA-256 at build time.
curl -fsSL --retry 3 https://api.github.com/repos/actions/runner/releases/latest -o runner-release.json
mapfile -t release < <(python3 - <<'PY'
import json, re
from pathlib import Path
release = json.loads(Path('runner-release.json').read_text())
version = release['tag_name'].removeprefix('v')
asset = next(a for a in release['assets'] if a['name'] == f'actions-runner-linux-x64-{version}.tar.gz')
digest = asset.get('digest', '')
if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
    raise SystemExit('Official runner release is missing a valid version or SHA-256.')
print(version)
print(digest.removeprefix('sha256:'))
PY
)
[[ "${#release[@]}" == 2 ]] || { echo 'Unable to resolve runner release.' >&2; exit 1; }
docker build --pull --build-arg "RUNNER_VERSION=${release[0]}" \
    --build-arg "RUNNER_SHA256=${release[1]}" -t hetzner-github-runner .

# A rebuilt image must start successfully before removing the previous container.
docker run --rm --entrypoint bash hetzner-github-runner -euc '
    test "$(id -u)" != 0
    /opt/actions-runner/bin/Runner.Listener --version
    docker --version
    docker compose version
    docker buildx version
    google-chrome --version
    cc --version >/dev/null
    sudo -n true
'
if docker container inspect runner-compliant-tools >/dev/null 2>&1; then
    managed="$(docker inspect --format '{{index .Config.Labels "com.complianttools.runner"}}' runner-compliant-tools)"
    [[ "$managed" == true ]] || { echo 'Refusing to replace a container not managed by this script.' >&2; exit 1; }
    # Avoid interrupting a running workflow during a redeployment.
    if [[ "$(docker inspect --format '{{.State.Status}}' runner-compliant-tools)" == running ]]; then
        processes="$(docker top runner-compliant-tools -eo pid,args)"
        if grep -q '[R]unner.Worker' <<< "$processes"; then
            echo 'Runner is executing a job. Redeploy when it is idle.' >&2
            exit 1
        fi
    fi
    docker stop --time 60 runner-compliant-tools >/dev/null
    docker rm runner-compliant-tools >/dev/null
fi

docker volume create runner-compliant-tools-data >/dev/null
docker run -d --name runner-compliant-tools --restart unless-stopped --init \
    --label com.complianttools.runner=true \
    --stop-timeout 60 --shm-size 1g \
    --log-opt max-size=10m --log-opt max-file=3 \
    --group-add "$(stat -c %g /var/run/docker.sock)" \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
    --mount type=volume,source=runner-compliant-tools-data,target=/runner \
    --env IMAGE_COMPLIANTTOOLS_COM_REPO_URL \
    --env IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN \
    hetzner-github-runner

for ((attempt=0; attempt<90; attempt++)); do
    if docker logs runner-compliant-tools 2>&1 | grep -q 'Listening for Jobs'; then
        docker ps --filter name='^/runner-compliant-tools$' --format '{{.Names}}: {{.Status}}'
        echo 'Runner connected to GitHub and is listening for jobs.'
        exit 0
    fi
    if [[ "$(docker inspect --format '{{.RestartCount}}' runner-compliant-tools)" != 0 ]]; then
        break
    fi
    sleep 2
done
docker logs --tail 60 runner-compliant-tools >&2
# Keep a bad registration from looping indefinitely with an expired token.
docker stop --time 60 runner-compliant-tools >/dev/null
echo 'Runner did not become ready. Check the log above and refresh the registration token if needed.' >&2
exit 1
'@

$null = New-Item -ItemType Directory -Force -Path $OutputDirectory
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
$files = @{
    'Dockerfile' = $dockerfile
    'entrypoint.sh' = $entrypoint
    'deploy.sh' = $deploy
    '.dockerignore' = "*`n!Dockerfile`n!entrypoint.sh"
}
foreach ($file in $files.GetEnumerator()) {
    # Explicit LF and UTF-8 without BOM: works even when generated on Windows.
    $content = ($file.Value -replace "`r`n", "`n").TrimEnd() + "`n"
    [IO.File]::WriteAllText((Join-Path $OutputDirectory $file.Key), $content, [Text.UTF8Encoding]::new($false))
}
Write-Host "Generated runner files in $OutputDirectory"
if ($GenerateOnly) { return }

$variables = @('IMAGE_COMPLIANTTOOLS_COM_REPO_URL', 'IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN')
$localEnvironment = @{}
if ($EnvironmentSource -ne 'Remote') {
    foreach ($name in $variables) {
        foreach ($scope in @('Process', 'User', 'Machine')) {
            $value = [Environment]::GetEnvironmentVariable($name, $scope)
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                $localEnvironment[$name] = $value.Trim()
                break
            }
        }
    }
    if ($localEnvironment.Count -eq 1 -or ($EnvironmentSource -eq 'Local' -and $localEnvironment.Count -ne 2)) {
        throw 'Set both local environment variables, or use -EnvironmentSource Remote for the VPS variables.'
    }
}
Write-Host "Using $(if ($localEnvironment.Count -eq 2) { 'local' } else { 'VPS' }) environment variables."
& ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost "mkdir -p -- '$RemoteDirectory'"
if ($LASTEXITCODE -ne 0) { throw 'Unable to create the remote runner directory.' }
$upload = @($files.Keys | ForEach-Object { Join-Path $OutputDirectory $_ })
& scp -q -o BatchMode=yes @upload "${SshHost}:$RemoteDirectory/"
if ($LASTEXITCODE -ne 0) { throw 'Unable to upload runner files.' }

# JSON travels only over encrypted SSH stdin, never in command arguments or files.
# An empty object retains the environment already exported by the VPS SSH session.
$bootstrap = 'import json,os,sys; os.environ.update(json.load(sys.stdin)); os.execv("/bin/bash", ["bash", "./deploy.sh"])'
$remoteCommand = "cd '$RemoteDirectory' && chmod 700 deploy.sh entrypoint.sh && python3 -c '$bootstrap'"
$localEnvironment | ConvertTo-Json -Compress | & ssh -o BatchMode=yes $SshHost $remoteCommand
if ($LASTEXITCODE -ne 0) { throw 'Runner deployment failed; see the remote output above.' }
