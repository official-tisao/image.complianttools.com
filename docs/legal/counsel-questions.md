# Counsel review packet

Prepared 2026-08-09. No recipient or legal contact was provided, so this packet has **not been sent**.
Until written clearance is recorded in `docs/ADR/ip-clearance.md`, each fallback below is mandatory.

| Question                                | Proposed use                                   | Fallback that ships meanwhile                                          |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| GrabCut patent/FTO status               | Interactive foreground selection               | Colour-range selection, watershed, independent iterative colour models |
| Poisson image editing patent/FTO status | Seamless compositing                           | Laplacian-pyramid blending                                             |
| Closed-form matting patent/FTO status   | Hair/edge alpha refinement                     | Joint-bilateral refinement and alpha-band trim                         |
| Non-local means patent/FTO status       | Denoising                                      | Bilateral filter and BayesShrink                                       |
| Social-platform preset names            | Dimension presets naming third-party platforms | Generic dimension-based names plus no logos/trade dress                |

Requested response: jurisdictional scope, relevant live claims/registrations, permitted implementation
boundaries, required notices, and a clear approve/exclude decision for each row.
