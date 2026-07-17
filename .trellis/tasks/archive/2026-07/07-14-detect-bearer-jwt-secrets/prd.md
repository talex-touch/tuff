# Detect Bearer and JWT Secrets

## Goal

Extend the shared ContextHygiene secret policy to detect unambiguous Bearer credentials and standalone JWTs across storage and degraded Provider fallback paths.

## Background

The 2.5.4 security design names Bearer tokens and JWTs among content that must not enter normal memory, turn storage, ContextPackage, or Provider fallbacks. The shared `containsSecret()` policy currently detects `sk-*`, classic GitHub PATs, key/value credentials, recovery phrases, and private-key headers, but a normal `Authorization: Bearer …` credential and an unlabelled JWT can pass through every dependent path.

## Requirements

- Extend the single host-owned classifier; do not add per-caller or per-service regex copies.
- Detect a case-insensitive `Bearer` scheme followed by a credential-like token of at least 16 characters using standard bearer-token characters.
- Detect a standalone three-segment JWT with JSON-looking base64url header and payload segments plus a nontrivial signature segment.
- Avoid classifying documentation placeholders such as `Bearer token`, `Bearer <token>`, or generic dotted text such as `foo.bar.baz`.
- Detection must propagate through turn redaction/privacy precedence, MemoryPolicy rejection, CompressionSnapshot blocking, and database-degraded invoke/stream fallback because those paths share the classifier.
- Preserve every existing secret pattern, safe explicit-private behavior, stable error/reason codes, SDK types, schema, and non-secret Provider execution.

## Acceptance Criteria

- [x] Focused classifier controls prove realistic Bearer/JWT values are unsafe while short placeholders and generic dotted text remain safe.
- [x] ContextHygiene regressions prove Bearer/JWT turns are marked secret, persisted only as the canonical redacted marker, excluded from ContextPackage, and absent from package-log metadata.
- [x] ContextExecution regressions prove database-degraded invoke/stream never call a Provider for Bearer/JWT input and reject with `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED` without leaking the credential.
- [x] MemoryPolicy coverage proves the newly recognized credentials cannot become normal MemoryItems.
- [x] Existing ContextHygiene/context-execution focused tests, targeted lint, and CoreApp node type-check pass.
- [x] 2.5.4/TODO/CHANGES and the Intelligence security quality contract record exact coverage and false-positive boundaries.

## Out of Scope

- General DLP, entropy scoring, every vendor credential format, opaque short tokens, remote classification, or user-visible recovery UI.
- SDK/schema changes, migrations, historical row scans, or production evidence capture.
