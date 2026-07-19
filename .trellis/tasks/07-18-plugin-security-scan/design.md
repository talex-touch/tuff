# Plugin Security Scan - Design

## Scan Pipeline

```text
.tpex bytes -> digest check -> package policy -> bounded inventory reader
            -> manifest capability projection
            -> content/rule scanners -> finding reducer -> decision/report
```

The scanner never executes plugin code and never extracts entries outside a controlled in-memory or temporary boundary.

## Module Boundaries

- `packages/utils/plugin/security-scan/types`: report, findings, severities and stable codes.
- Node scanner package/surface: archive/file readers, text/binary classification and rule execution.
- CLI adapter: local preflight and JSON report output.
- Nexus adapter: authoritative server execution, timeout, persistence and governance events.

Browser-safe shared packages must not import Node filesystem or crypto implementation details.

## Rule Model

Each rule declares:

- id and rule-set version
- applicable file types/Manifest fields
- maximum bytes inspected
- severity and default blocking behavior
- sanitizer for evidence metadata

Initial categories:

1. archive/type anomalies not already rejected by policy;
2. private-key, credential and token material;
3. production dev URL/source flags;
4. raw Electron/Node/transport imports and escape markers;
5. dynamic execution and worker/native addon markers;
6. executable/native binary inventory;
7. declared permission versus detected capability mismatch.

Findings are signals, not proof of exploit. Exact-match allowlists and bounded AST/token inspection are preferred over broad regex where parsers already exist.

## Decision Reduction

- any non-waived Critical/High -> `blocked`;
- engine/rule failure or timeout -> `unavailable` and blocked;
- only Medium/Low -> `review-required`;
- no findings -> `passed`.

A waiver is a Nexus-owned object keyed by rule id + artifact digest, with owner, reason, creation, expiry and optional ticket. Package content cannot carry waivers.

## Report Hygiene

Reports store relative path, content digest, optional line/column span and redacted classifier metadata. They never store matched secret values, complete lines, complete source files, archive bytes, tokens or absolute host paths.

## Nexus Persistence

Version rows store scan decision, report digest, scanner/rule-set versions, finding count and completed timestamp. The full bounded report remains admission-local; platform governance records started/completed/blocked/unavailable plus waiver create/revoke without embedding report content.

## Determinism and Limits

Rules iterate normalized paths in lexical order. Finding order is stable. File count, inspected bytes, per-file bytes and total duration are bounded. Unsupported encoding/binary classification is explicit rather than silently skipped.

## Rollout/Rollback

Start with shadow reports for current approved packages, fix false positives, then enforce on new admissions. Rollback can disable a non-safety rule set version, but scanner unavailable and package-policy failures remain fail closed.
