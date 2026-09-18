# P4-16 Blocker Resolution — Report (no repo changes, no download)

Status: BLOCKED (Phase 3 complete per user STOP instruction). No changes to `plan.md` ([!] preserved), ADR (`docs/ADR/ip-clearance.md` unchanged — line 127 remains exclusion, line 110 remains exclusion), `docs/static-assets.json` (empty — no unverified asset added), `packages/engine/src/cv/`, `packages/engine/test/`, `package.json`, or CI. Nothing committed. No `.pth` downloaded (verified: `find . -name '*.pth'` = empty before and after).

---

## Authoritative sources used (quoted / fetched)

- `https://github.com/xinntao/Real-ESRGAN` (repo homepage + LICENSE file fetched): repo-level BSD-3-Clause only; no separate `.pth` licence statement.
- `https://github.com/xinntao/Real-ESRGAN/releases` (release page fetched): assets include `RealESRGAN_x4plus.pth` (v0.1.0) and `RealESRGAN_x2plus.pth` (v0.2.1); download URLs confirmed; no checksum/hash listed in release notes.
- `https://github.com/xinntao/Real-ESRGAN/blob/master/README.md`: only generic BSD-3-Clause badge; weight download commands lack licence clauses.
- `docs/ADR/ip-clearance.md` lines 110, 127 — read directly.
- `README.md` §7.3, §13.1.3, §25.3 / §25.5 / §25.3.4 — read directly.
- `packages/engine/package.json` — no `.pth` loader dependency; no `onnxruntime-web` installed.
- `docs/static-assets.json` — requires sha256 + licence + url + date per asset.

---

## Path A — Real-ESRGAN (existing approach)

### Exact unblock steps (all conditional on user/IP approval):

1. **BLOCKER 1 (licence)** — Obtain affirmative written/licence evidence that `.pth` weights (`RealESRGAN_x4plus.pth` v0.1.0 and `RealESRGAN_x2plus.pth` v0.2.1) are covered by BSD-3-Clause. If no such evidence exists, the ADR exclusion (line 127) must remain; P4-16 stays blocked. This is a HUMAN/IP decision — do NOT infer from repo-level BSD-3.
2. **BLOCKER 2 (hash)** — Once download is permitted: download from official release URLs; compute sha256 locally; record in `docs/static-assets.json` with exact URL, licence, licence URL, sha256, verified date, attribution. ADR allows locally-computed hash ONLY if it is of an exact official release asset — confirm before computing.
3. **BLOCKER 3 (runtime)** — `onnxruntime-web` is ADR-excluded (line 110). Any P4-16 inference path requires either:
   a. Changing ADR line 110 through formal ADR process (user explicitly said DO NOT), OR
   b. Running inference outside the framework-agnostic engine (e.g. Python/PyTorch worker process — introduces external runtime dependency; not framework-agnostic; deployment impact significant), OR
   c. Converting `.pth` to TorchScript or ONNX and using an approved runtime — no approved `.pth`/ONNX runtime exists in current engine; conversion reproducibility must be documented; any new runtime requires ADR approval.
4. **Only after (1), (2), (3) resolved:** register assets; implement inference; add measured comparison in `packages/engine/bench/escalation/` (no fabricated metrics); update `plan.md` from [!] to [x].

### Evidence status for Path A:

- Official URLs verified: yes.
- Weight licence verified separately from source: NO (unresolved — needs human/IP review).
- Authoritative upstream hash published: NO (blocker — none found).
- Approved inference runtime for `.pth`: NO (`onnxruntime-web` excluded; no alternative approved).

---

## Path B — Alternative model

Criteria: Real-ESRGAN-class ×2/×4, explicit weight licence, clear provenance, hashable asset, approved runtime (does not require `onnxruntime-web` change), measurable against DCCI/NEDI.

Candidates identified (no selection made; no download):

- Any model that can be served via an approved runtime (e.g. MIT-licensed ONNX runtime if ADR line 110 is resolved separately, or a Python-side worker) with an explicitly licensed `.pth` or `.onnx` weight. Specific alternatives not confirmed — search returned no clearly licensed, hash-published, framework-agnostic super-resolution model that avoids all three current blockers. Any alternative would require the same ADR/licence/hash verification cycle.

Recommendation: resolve BLOCKER 3 (runtime) separately from model choice; once an approved runtime exists, either Real-ESRGAN (if BLOCKER 1/2 resolved) or an alternative with the same verification cycle can proceed.

---

## Recommended next technical step (before any implementation/download):

**Stop after Phase 3 as instructed.** The concrete next action is a user/IP decision:

1. Confirm whether BSD-3 applies to `.pth` weights (BLOCKER 1). If yes: provide citation/reference. If no: P4-16 blocked; either select different model class or document inability.
2. Confirm whether ADR permits locally-computed sha256 of official `.pth` download (BLOCKER 2). If yes: proceed to Phase 4 (official download + hash computation + `docs/static-assets.json` entry). If no: obtain upstream hash (not available from current evidence) or drop.
3. Confirm ADR line 110 decision (BLOCKER 3 — `onnxruntime-web` exclusion). If the exclusion remains, no `.pth`/ONNX inference can enter the framework-agnostic engine. A separate non-engine runtime (Python worker) could be proposed, but that requires its own architecture/ADR review and does not satisfy the framework-agnostic engine spec.

Only after all three decisions are recorded should Phase 4 begin. No download, no `plan.md` change, no ADR edit, no commit until then.
