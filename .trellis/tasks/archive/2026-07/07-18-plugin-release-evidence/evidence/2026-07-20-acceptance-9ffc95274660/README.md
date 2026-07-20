# Plugin release evidence: acceptance 9ffc95274660

## Result

Strict production acceptance passed for `com.tuffex.acceptance.9ffc95274660` version `0.0.0-beta.20260720.9ffc95274660` in `BETA`.

- Artifact SHA-256: `56acb408adfc26d30cd49aedf77dec6c272b77f5ed91f2367927f0180ee08aff`
- Artifact size: `15360` bytes
- Nexus plugin row: `ad86433c-900b-43fb-a5d0-bd5e7ee3bdfe`
- Nexus version row: `84c3cc6f-9303-48d8-bd40-472d25a87b75`
- R2 object: `e6fd67a5-f4ae-42ea-b889-ac216e9f71ef.tpex`
- Production deployment: `81c42e20-cbf3-401b-92a6-00a092c2f812`

## Environment boundary

The accepted path used the production Pages deployment, D1 binding `DB`, and R2 binding `R2` backed by `tuff-nexus-imgable-prod`. The D1 response reported `v3-prod`, `APAC`, `NRT`. No local-only or memory fallback record satisfies a production gate.

## Verified chain

The same artifact digest is bound across clean source build, package policy v1, deterministic security scan v1, Ed25519 publisher signature, Nexus admission attestation, D1 version state, R2 persistence, BETA Store listing/detail/download, CoreApp TPEX provider installation, and the minimal text conversion feature.

The version remains intentionally retained as controlled BETA evidence. Public list, search, and detail omit it; an authenticated moderated BETA request can list, search, resolve, and download it. A duplicate publish returned HTTP 400 while the D1 version count and R2 object inventory remained unchanged.

## Hygiene

This directory contains only the bounded artifact, allowlisted JSON projections, manifest, checklist, deterministic verifier output, and exit-code capture. Raw process output and credential-bearing request material are excluded.
