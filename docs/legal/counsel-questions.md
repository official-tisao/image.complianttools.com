# Counsel review packet — algorithm clearance

**Prepared:** 2026-08-09
**Recipient:** Festus Ogun, FOLEGAL
**Status:** finalised, awaiting send by the client. Not yet sent.
**Standing rule:** until written clearance for a row is recorded in `docs/ADR/ip-clearance.md`,
that row's fallback is mandatory and the primary implementation must not ship.

---

## 1. Background

We are building a browser-based image editing toolkit. It is entirely client-side: image data is
processed in the user's browser and is never uploaded to any server we operate. The product is free,
has no accounts, and has no paid tier at present. It will be published as open source.

Because the product is delivered as a public website, it is reachable from every jurisdiction. Our
working assumption is that meaningful exposure is concentrated in the jurisdiction of our operating
entity, with secondary exposure in the United States and the European Union by virtue of
accessibility and user base. **Confirming that scope is itself one of our questions** — see §4.

### What we have and have not done

We have completed an **internal copyright and licensing audit**. Every third-party dependency has
been checked against a licence allowlist (MIT, Apache-2.0, BSD-2/3, ISC, Zlib, 0BSD, MPL-2.0,
Unlicense, CC0), copyleft dependencies have been removed, and the audit is enforced automatically in
our build pipeline. We are reasonably confident on the copyright side.

We have **not** conducted, and are not qualified to conduct, any freedom-to-operate analysis. We
have read no patent claims and we assert no conclusions about any patent's validity, scope, or
status. Where we reference publication dates below, they are a **screening heuristic** we used to
decide which items to bring to you — not findings.

---

## 2. What we are asking for

For each of the five items in §3, a clear **approve / exclude / approve-with-conditions** decision,
supported by:

1. **Jurisdictional scope** — which jurisdictions your opinion covers
2. **Live rights identified** — any unexpired patents or registrations you consider relevant
3. **Implementation boundaries** — if approved with conditions, what specifically we must avoid
4. **Required notices** — any attribution or notice text we must carry
5. **Residual risk** — your characterisation of what remains after following your advice

We do not need a full freedom-to-operate search unless you advise one is warranted. A screening
opinion sufficient to make a ship/don't-ship decision is what we are after. If your view is that
one or more items requires a full search to answer responsibly, please say so and quote separately
for that work.

---

## 3. The five items

Each item states: what the technique does, what we would use it for, what we know about its origin,
and what we will ship if you say no. **Every fallback below is already implemented and working.**
A "no" on any row costs us a feature's quality, not the feature itself.

---

### 3.1 GrabCut — interactive foreground selection

**What it does.** An interactive image segmentation method. The user draws a rough rectangle around
a subject; the algorithm builds colour models for the presumed foreground and background, then
iteratively refines the boundary using a graph-cut energy minimisation, alternating between
re-estimating the colour models and re-cutting.

**Our proposed use.** A "select subject" tool — the user drags a box around a person or object and
we produce a selection mask they can then edit, cut out, or use to replace a background.

**Origin.** Published by Rother, Kolmogorov and Blake at SIGGRAPH 2004, work done at Microsoft
Research. Corresponding patent applications were filed by Microsoft in the mid-2000s. The technique
is widely implemented in open-source libraries, including OpenCV's main (non-restricted) module.

**Fallback that ships if excluded.** Colour-range selection plus watershed segmentation, with an
independent iterative colour-model refinement of our own construction. Lower quality on soft or
low-contrast boundaries; adequate for the common case.

---

### 3.2 Poisson image editing — seamless compositing

**What it does.** Composites a region of one image into another by solving a Poisson partial
differential equation over the pasted region, matching the gradient field of the source while
constraining the boundary to the destination's values. The visual effect is that the seam
disappears and the insert picks up the destination's lighting.

**Our proposed use.** Background replacement and object insertion, so that a subject moved onto a
new background does not look pasted on.

**Origin.** Published by Pérez, Gangnet and Blake at SIGGRAPH 2003, again Microsoft Research. Patent
applications were filed around the same period.

**Fallback that ships if excluded.** Laplacian-pyramid blending — a multi-resolution technique
predating the above by roughly two decades (Burt and Adelson, 1983) and, to our understanding, long
out of any patent term. Noticeably worse at matching illumination; acceptable for most composites.

---

### 3.3 Closed-form matting — alpha refinement

**What it does.** Estimates a per-pixel transparency (alpha) value by assuming foreground and
background colours are locally near-linear, which reduces the problem to a sparse linear system with
a closed-form solution. It is the standard method for extracting fine detail such as hair, fur, or
motion blur from a background.

**Our proposed use.** Refining the edges of a cutout after coarse background removal, so hair does
not appear chopped off.

**Origin.** Published by Levin, Lischinski and Weiss (2006 conference, 2008 journal version). We
have not established whether patent applications were filed or by whom, which is part of what we
are asking.

**Fallback that ships if excluded.** Joint-bilateral edge refinement plus an alpha-band trim. Hair
detail is visibly coarser; solid-edged subjects are essentially unaffected.

---

### 3.4 Non-local means — denoising

**What it does.** Removes image noise by, for each patch of the image, finding other patches
elsewhere in the same image that look similar and averaging them. Because the averaged patches are
genuinely similar, detail survives that a local blur would destroy.

**Our proposed use.** A denoise tool, particularly for photographs taken in low light.

**Origin.** Published by Buades, Coll and Morel in 2005. We understand patent applications were
filed in connection with the work but we have not verified assignee, jurisdiction, or status.

**Fallback that ships if excluded.** Bilateral filtering combined with BayesShrink wavelet
thresholding. Meaningfully worse at preserving fine texture; still a real improvement over doing
nothing.

---

### 3.5 Social-platform preset names — trademark question

This one is trademark, not patent, and is the item most likely to affect the product's usability.

**What we want to do.** Offer image-dimension presets for common uses, named for the platform they
target — for example a preset labelled "Instagram post (1080 × 1080)" or "YouTube thumbnail
(1280 × 720)".

**Why we think it may be permissible.** We would use the platform names only to describe what the
preset is for. We would use no logos, no brand colours, no trade dress, and no styling that
suggests the platform endorses or is affiliated with us. Our understanding is that this is the kind
of use nominative fair use is meant to cover, but we would like that confirmed rather than assumed,
and we recognise that the doctrine's contours differ by jurisdiction.

**Specific questions.**

- Is naming the platform in a purely descriptive preset label acceptable?
- If yes, are there conditions — a disclaimer, a specific phrasing, a placement requirement?
- Does the answer change because the product is free, or because it is open source and others will
  redistribute it?

**Fallback that ships if excluded.** Generic names describing the shape and use rather than the
platform — "Square 1080 × 1080", "Widescreen thumbnail 1280 × 720". Materially worse for users,
who search by platform name, but entirely safe.

---

## 4. Threshold questions

Please answer these before the substantive items, as they may change the scope of the engagement:

1. **Jurisdiction.** Which jurisdictions can you opine on, and which do you consider material for a
   free, open-source, client-side web application accessible worldwide? We would rather scope this
   correctly than over-buy.
2. **Fit.** Items 3.1–3.4 are software patent screening questions. If that falls outside your
   practice, please tell us plainly — we would rather be referred than receive a hedged answer.
3. **Open source.** The product will be published under a permissive licence. Does downstream
   redistribution by third parties change your analysis of any item, particularly 3.5?
4. **Scope and fee.** An estimate of cost and turnaround for the work you consider appropriate.

---

## 5. Commercial context

- Timeline: not urgent. All five fallbacks are implemented and shipping. Nothing is blocked.
- We are seeking a screening opinion to decide whether to invest in the primary implementations.
- If the answer to any item is "you would need a full search to know," a decision of **exclude** is
  perfectly acceptable to us. We are not looking to be told yes.

---

## 6. Response record

Complete this table on receipt and mirror each decision into `docs/ADR/ip-clearance.md`.
A row without a recorded decision remains **excluded** and its fallback remains mandatory.

| Item                      | Decision | Jurisdictions | Conditions / required notices | Date | Reference |
| ------------------------- | -------- | ------------- | ----------------------------- | ---- | --------- |
| 3.1 GrabCut               |          |               |                               |      |           |
| 3.2 Poisson image editing |          |               |                               |      |           |
| 3.3 Closed-form matting   |          |               |                               |      |           |
| 3.4 Non-local means       |          |               |                               |      |           |
| 3.5 Platform preset names |          |               |                               |      |           |
