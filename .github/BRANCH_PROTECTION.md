# Branch protection

Protect the default `master` branch with these rules. This repository setting is external to source
control; it must be enabled manually in GitHub. The workflow names below are published by
`.github/workflows/ci.yml` and only become selectable as required checks after a first run.

## Rules

| Setting                                          | Value                                  |
| ------------------------------------------------ | -------------------------------------- |
| Branch name pattern                              | `master`                               |
| Require a pull request before merging            | ✅                                     |
| Require approvals                                | 1                                      |
| Dismiss stale reviews                            | ✅                                     |
| Require review from Code Owners                  | (only if a `CODEOWNERS` file is added) |
| Require status checks to pass before merging     | ✅                                     |
| Require branches to be up to date before merging | ✅                                     |
| Require conversation resolution before merging   | ✅                                     |
| Block force pushes                               | ✅                                     |
| Block branch deletions                           | ✅                                     |

## Required status checks

Select each of these by its workflow `name` (the "lint, typecheck, test, build" name is the `verify`
job's display name):

1. `lint, typecheck, test, build`
2. `no-network`
3. `browser-e2e`
4. `credential-leak`
5. `raw-corpus`
6. `embedded-compile`

The `lighthouse` job is a matrix (`lighthouse (core)`, `lighthouse (modern-formats)`,
`lighthouse (document-and-export)`, `lighthouse (data-and-metadata)`); require all four groups once
the deployment-origin Lighthouse pass (P7-09) is established. Until then, `lighthouse` runs but is
not required, mirroring the Gate 0 waiver tracked as **P7-15** in `PLAN.md`.

## How to verify

After enabling the rules, confirm enforcement by attempting a direct push to `master`; it must be
rejected with the branch-protection message, and a red PR must be unmergeable.
