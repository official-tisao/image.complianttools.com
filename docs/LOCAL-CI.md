# Local GitHub CI checks

Build the reusable toolchain image once (the first build downloads several GB):

```powershell
docker compose --profile githubci build githubci
docker compose --profile githubci run --rm githubci test
```

The second command reuses the image. After changing the workflow, dependency
manifests/lockfile, RAW corpus manifest, Dockerfile.githubci or runner scripts,
rebuild the image. Docker caches unchanged layers. To explicitly build and run:

```powershell
docker compose --profile githubci run --build --rm githubci test
```

`list` instead of `test` shows the expanded job list without running checks.

## What runs

The runner reads `.github/workflows/ci.yml`, including all four Lighthouse matrix
rows, RAW corpus verification and embedded compilation. It runs workflow shell
commands with Bash fail-fast/pipefail inside separate Ubuntu 24.04 containers.
The image supplies Node 22, pnpm 9.15.5, Docker CLI/Compose/Buildx, all three
Playwright browsers, pinned LVGL checkouts, Arduino targets/libraries and the
SHA-256-verified RAW corpus. Frozen dependency installation is repeated offline
to validate the lockfile and run lifecycle hooks. No act/action downloads occur.

This is an intentionally limited workflow executor, **not a full GitHub Actions
emulator**. Unknown actions, expressions, platforms, job dependencies and
conditions cause an error, not a silent skip. Setup actions are reported as
`PREBAKED`; the informational PR comment is `HOSTED-ONLY`. GitHub API permissions,
branch protection, action implementation bugs, cache service integration and
hosted-runner performance differences still require GitHub. A local pass does
not promise that every possible hosted CI failure has been eliminated.

The production image build remains a real Docker build, using the same validation
script on GitHub and locally. Its first build may fetch base images and npm
dependencies; subsequent builds reuse Docker/BuildKit layers. Build-time and
application tests are not guaranteed air-gapped. Tools/fixture setup is prebuilt.

## Resources and parallelism

Independent non-performance jobs run two at a time by default. Each gets 2 CPUs,
3 GiB memory and 1 GiB shared-memory capacity (not preallocated). The runner lowers
concurrency if Docker's allocated CPU/RAM cannot support it. Leave room for other
containers; nested production Docker builds also use daemon resources.

For useful parallelism, allocate at least 4 CPUs and 8 GiB to Docker Desktop;
12–16 GiB is preferable for browsers plus Docker builds. Adjust before running:

```powershell
$env:GITHUBCI_PARALLEL = '2'
$env:GITHUBCI_MEMORY = '3g'
$env:GITHUBCI_CPUS = '2'
docker compose --profile githubci run --rm githubci test
```

Lighthouse and the verify job (which contains the latency benchmark) run alone to
reduce measurement noise. Unrelated host processes can still affect timings.
Job timeouts come from the workflow. Failed checks do not cancel other jobs;
later shell steps also run to expose additional failures (some can be cascading).

## Source, history and safety

Tracked files and non-ignored untracked files, including uncommitted edits, are
snapshotted once. Host `node_modules`, build outputs, `.git`, caches and `.env`
secrets are excluded. Every job starts with fresh writable image layers and its
own snapshot; the host repository is mounted read-only. Do not edit the source
during snapshot creation. Git submodules and arbitrary checkout options are not
supported.

The snapshot gets an empty Git repository solely for install hooks; host history
is never copied. Changing only runner code reuses the heavy provisioning layer.

Plan-sync compares the working tree with `HEAD^` by default, including staged and
unstaged edits and untracked files. Set `GITHUBCI_BASE` to the PR base commit (or
its merge base with HEAD) for the equivalent PR change range. Fetch that commit
first if necessary. The latest commit message supplies the exemption text.

Docker validation uses unique containers/networks, checks health, HTTP status,
Svelte HTML, exact isolation headers and both concurrent requests. It does not
tear down the developer's web stack or use `down --remove-orphans`.

The coordinator and Docker validation job mount the Docker socket, which grants
control of your Docker daemon. Run only trusted source; this is not a security
sandbox for untrusted pull requests. Normal test jobs do not receive the socket.

## Results

Each run prints a final job summary and returns nonzero on any failure. Find
`summary.md`, `summary.json`, per-job `output.log` and `steps.json` under
`.cache/githubci/<timestamp-id>/`. Browser reports/traces and Lighthouse reports
are copied there when produced. `PREBAKED` and `HOSTED-ONLY` are not test passes.
Preflight errors (including a stale image) also produce a failing summary.

Runner regression checks: `python -m unittest discover -s scripts/githubci -p test_*.py`
(requires PyYAML, included in the image).
