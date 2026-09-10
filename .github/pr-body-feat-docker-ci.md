## Summary

- New **lean production image** (`ctimg-web:local`, 223 MB on disk / 69 MB content) serving the static SvelteKit build via `nginx:1.27-alpine`.
- New `docker-compose.yml` service pinned to **1 CPU, 128 MiB memory**, `restart: unless-stopped`, with healthcheck and a `/tmp` tmpfs.
- New `.env.example` template + `.dockerignore` that keeps the build context under 1 MB.
- New `docker-validate` GitHub Actions job that builds the image, boots a container, asserts **HTTP 200, COOP/COEP headers, two concurrent requests succeed**, and tears down on every push and PR.

## Verified locally

| Probe                                                                              | Result                       |
| ---------------------------------------------------------------------------------- | ---------------------------- |
| `/`, `/convert`, `/compress`, `/heic-converter`, `/convert/png-to-webp`            | 200                          |
| Missing path                                                                       | 404                          |
| Gzip precompressed HTML                                                            | 13 KB → 4 KB (68% reduction) |
| Two concurrent requests                                                            | 200 in ~4 ms each            |
| Container memory                                                                   | 2.4 MiB / 128 MiB (1.9%)     |
| COOP / COEP / CORP / Referrer-Policy / HSTS / X-Frame-Options / Permissions-Policy | all present                  |

## Notes

- Dockerfile is a **single runtime stage** (`nginx:1.27-alpine`) — the `pnpm build` step runs on the host or in CI, not in the container, to avoid bundling a Node toolchain. The CI job runs `pnpm --filter @complianttools/web build` before `docker build`.
- Brotli precompressed assets are not served (would need `nginx-mod-http-brotli`); `gzip_static` is enabled and does the heavy lifting.
- Healthcheck uses the shell form (`CMD-SHELL`) so `wget`'s stdout/stderr redirects work; the array form passes them as literal arguments and silently fails.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
