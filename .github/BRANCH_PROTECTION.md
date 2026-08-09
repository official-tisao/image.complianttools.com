# Branch protection

Protect the default `master` branch and require the `CI / lint, typecheck, test, build` status check
before merging. Also require branches to be up to date, block force pushes and deletions, and require at
least one approving review.

This repository setting is external to source control. Verify it in GitHub under **Settings → Branches
→ Branch protection rules** after the first pull request has published the workflow check name.
