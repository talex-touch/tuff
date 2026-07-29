# Design: documentation quality gates

## 1. Integration boundary

Batch D is an integration consumer, not a fifth prose cleanup batch. Before implementation, record a prerequisite ledger containing the A, B, C, and bilingual PR URLs, commits, and ownership exclusions. The integration branch must contain those exact commits.

If the verifier finds content drift in a prerequisite-owned path, stop and route the finding to that owner. In particular, `README.md` and `README.zh-CN.md` remain Batch B files even though the final recursive gate reads them.

## 2. Canonical command

`mise run docs:verify` is the only public entrypoint. It performs, in order:

1. focused verifier regression tests;
2. repository scope discovery from `git ls-files`;
3. all rule-family checks;
4. deterministic diagnostic rendering and exit.

The main CI workflow installs the repository's declared Node/PNPM dependencies and calls the same command. Retire the existing changed-only Markdown job and consolidate the standalone AI docs workflow so neither YAML nor a legacy script owns a second rule set.

The implementation should follow existing ESM script conventions under `scripts/`. A likely shape is a thin CLI, rule modules, a shared diagnostic model, and fixture-driven tests under one `scripts/docs/` boundary. Exact filenames are chosen during implementation after searching current script conventions.

## 3. Scope registry

One scope registry owns tracked-file projection for all rules:

```text
git ls-files
  -> normalize repository-relative POSIX paths
  -> classify product docs / active tasks / archived tasks / active PRDs
  -> apply explicit exclusions
  -> stable sorted arrays passed to rule modules
```

No rule performs its own broad walk. Scope exclusions are named and tested: agent/platform instructions, `.trellis` internal/archive content for product parsing, raw evidence, generated/build/cache/dependency trees, runtime state, and `.pen` sources. Trellis rule modules separately receive the active and archived task projections they need.

Batch C's final include/exclude and relative-link handoff is the starting contract. Any scope change is represented in the registry and a fixture, avoiding hidden per-rule exceptions.

## 4. Parser and link resolver

Use one declared Markdown AST/parser dependency for Markdown and MDC inline link/image nodes. Do not parse Markdown syntax with regular expressions.

The resolver classifies each URL before filesystem lookup:

1. external scheme, absolute web URL, mail URL, or fragment-only: skip;
2. invalid encoding or unsafe syntax: diagnostic;
3. relative path: remove query/fragment, percent-decode, resolve from source;
4. normalized path outside repository: repository-escape diagnostic;
5. inside repository: require a Git-tracked file or a documented tracked directory-index form.

Diagnostics retain source path, line, column, original URL, resolved path, and stable rule ID. Semantic anchor checks remain separate unless the selected parser provides deterministic heading identifiers and fixtures lock the behavior.

## 5. Rule architecture

Every rule returns data and does not print or mutate:

```text
RuleResult := { ruleId, diagnostics[] }
Diagnostic := { ruleId, path, line, column, message, detail? }
```

The command owns rendering, total counts, display caps, and process exit. Diagnostics sort by `ruleId`, path, line, column, then message. Absolute paths, timestamps, temporary-directory names, environment-dependent ordering, and network state never enter output.

Rule families are:

- recursive Markdown/MDC lint;
- tracked inline relative links/images;
- Trellis JSON identity, parent/child, assignee/meta, and active/archive completion;
- TODO references and active/completed distinctions produced by Batch A;
- current root/CoreApp version plus bilingual release-note coverage/shape;
- AI evidence semantics, sharing one assertion implementation with the existing AI verifier;
- active PRD unresolved placeholders plus explicit allowlist.

## 6. Structured contracts

### Trellis and TODO

Parse JSON and Markdown through structured readers. Active task hierarchy is checked as a graph keyed by directory/task identity. Parent and child references must agree in both directions. Active completed tasks and archived non-completed tasks are separate stable diagnostics.

Batch A must hand off a machine-checkable TODO reference shape. D validates that shape and that referenced tasks are active or intentionally historical. It does not guess status from free-form wording, branch names, or age.

### Current release notes

Parse both root and CoreApp package metadata and require equal valid versions. Resolve exactly two bilingual note paths. Validate H1 version identity, allowed section names/order, non-empty highlight bullets, and corresponding zh/en section and bullet counts. Content translation quality remains human review.

### AI evidence

Extract the current AI checks into a shared rule or invoke one exported checker so `ai-docs:dev` and the canonical docs command cannot drift. Historical evidence is an input to classification, never a mutation target. Exact-version packaged completion requires the strict current-version contract; active prose cannot upgrade historical evidence by wording.

### Active PRD placeholders

Active paths come from the converged navigation/TODO/task graph. Placeholder rules use explicit token/shape matchers with stable IDs. The allowlist is structured by path and rule with a mandatory rationale and is covered by both accepted and rejected fixtures.

## 7. Fixtures and test harness

Fixture repositories contain a minimal tracked-file manifest and repository-shaped directory tree. The harness injects the fixture root and tracked set directly into rule modules, avoiding shelling out to a real Git repository for every unit case.

Coverage includes one valid aggregate fixture, one failure per rule family, edge cases for link decoding/escape, active/archive graph asymmetry, version mismatch, missing bilingual notes, historical evidence promotion, placeholder allowlist controls, and poison documents under excluded directories.

An integration test runs the CLI twice against the same fixture and compares stdout, stderr, and exit code exactly. A repository smoke snapshots `git status --porcelain --untracked-files=all` before and after the canonical command. Test temporary files live outside the repository and are removed after the run.

## 8. CI, compatibility, and rollback

CI keeps `permissions: contents: read`, uses existing runtime-version sources, and performs the normal frozen install before the canonical command. Workflow path filters, if retained, include the command, rules, fixtures, dependency manifests, documentation scopes, and workflow itself; the main PR CI remains the authoritative invocation.

Batch D is enforcement-only and starts after the repository passes. Rollback reverts the verifier/fixture/command/CI commit as one unit and restores the previous CI definition. Do not weaken a failing rule or edit prerequisite prose inside D merely to unblock CI.
