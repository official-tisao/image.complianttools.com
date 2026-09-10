# Hetzner GitHub Actions runner

From PowerShell 7 in the repository root:

```powershell
./scripts/setup-hetzner-runner.ps1
```

The script generates `Dockerfile`, `entrypoint.sh`, `deploy.sh` and `.dockerignore`
in `.cache/hetzner-github-runner` using LF line endings and UTF-8 without a BOM.
It uploads those files over `ssh hetzner_vps_1` to
`~/deploy/hetzner-github-runner`, builds `hetzner-github-runner` on the VPS and
starts the detached `runner-compliant-tools` container with `--restart unless-stopped`.

It reads `IMAGE_COMPLIANTTOOLS_COM_REPO_URL` and
`IMAGE_COMPLIANTTOOLS_COM_REPO_RUNNER_TOKEN` from the local process, user or
machine environment. If neither is present locally, it uses the variables already
exported in the VPS SSH session. To select the VPS explicitly:

```powershell
./scripts/setup-hetzner-runner.ps1 -EnvironmentSource Remote
```

Use `-EnvironmentSource Local` to require the Windows variables, or `-GenerateOnly`
to generate files without connecting. Values are trimmed and validated. Local
values travel through SSH stdin; credentials are never written into generated
files or Docker build arguments. Docker receives environment variable names and
reads their values from the remote process environment.

The Ubuntu 24.04 x64 image includes Git, compiler tools, Python, Chrome, sudo,
and Docker CLI/Compose/Buildx. Workflow actions install Node, pnpm, Playwright
and Arduino. The runner runs as an unprivileged user with sudo inside its
container. Docker validation uses the VPS Docker socket, which grants host-level
Docker access; this runner is intended for trusted repository workflows.

The named volume `runner-compliant-tools-data` preserves the runner's registration,
automatic updates and work directory across restarts and container replacements.
The setup script checks that GitHub reports `Listening for Jobs`, and refuses to
replace a container while a runner job is executing. Re-run the same command to
rebuild and redeploy when idle.

To add four more runners while keeping the original container running:

```powershell
./scripts/setup-hetzner-runner.ps1 -EnvironmentSource Remote -RunnerNames runner-compliant-tools-2,runner-compliant-tools-3,runner-compliant-tools-4,runner-compliant-tools-5
```

`-RunnerNames` selects exactly which containers to create or redeploy. Omitting
it selects only `runner-compliant-tools`. Each name is also its GitHub registration
name, and each uses a separate `<name>-data` volume. Never share or clone a runner's
registration volume between containers. All runners use the same image and labels;
GitHub can assign one job to each available runner. CPU, RAM and disk capacity on
the VPS are shared by all containers.

[GitHub registration tokens expire after one hour](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
A saved registration does not need a fresh token on each restart. If the volume
is removed or the runner is removed in GitHub, obtain a new registration token
from the repository's **Settings → Actions → Runners** before registering again.

```powershell
ssh hetzner_vps_1 'docker logs --tail 50 runner-compliant-tools'
ssh hetzner_vps_1 'docker ps --filter name=runner-compliant-tools'
```

Both CI and benchmark-recording workflows use `runs-on: self-hosted`. Each container
executes one GitHub job at a time; GitHub queues jobs when all runners are busy. The benchmark workflow
records results with `BENCH_RUNNER_ID: self-hosted`. The local Docker Compose CI tester
continues to work and accepts the new `self-hosted` workflow value. Workflow
changes take effect on GitHub after they are pushed.
