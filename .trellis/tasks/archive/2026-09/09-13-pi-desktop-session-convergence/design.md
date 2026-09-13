# Design: PI Desktop session convergence and migration audit

## Task Structure

The parent owns the fixed privacy/trust contract and integration review. Two ordered implementation children mutate product code; the final child is a read-only comparative audit except for its report artifacts.

## Shared Session Model

`local_ai_cli_sessions` remains the single local pointer registry for provider-owned transcripts. External discovery writes `origin='discovered'`. Home Pi continuation adds a nullable local-only conversation binding so the same tuple lease and provider identity rules cover OmniPanel and Home without exposing native ids to the renderer.

Pointers bound to Home conversations are not rendered as duplicate Local AI rows. Deleting a Home conversation removes only its pointer mapping; the provider transcript remains untouched.

## Trust Boundaries

- Discovery is an explicit project action and accepts only `projectId` from the trusted host renderer.
- Main resolves the project and scans fixed provider-owned session roots with bounded, no-symlink traversal.
- Candidate `cwd` is canonicalized and must equal the selected Project root before persistence.
- Only bounded title/timestamps/provider/state/origin cross to the renderer. Native identity and file path remain main-only.
- Home continuation is enabled only for host Home metadata carrying an opaque conversation id; plugin calls cannot claim this path.

## Compatibility

Non-Home Pi calls remain ephemeral because title generation, translation, and capability probes are not conversations. Legacy/cross-device Home threads without a local native pointer create one local native Pi session and seed visible history once. A mapped thread then sends only the newest user turn and relies on Pi's native context.

## Rollback

The schema extension is additive. Rolling code back leaves an unused nullable conversation binding and provider transcripts. Discovery never rewrites or deletes provider files, so rollback does not affect source sessions.
