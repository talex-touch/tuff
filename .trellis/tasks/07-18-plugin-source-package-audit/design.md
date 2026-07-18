# Plugin Source Package Audit - Design

## Canonical Registry

Add one release-target registry owned by the build tooling. Each entry contains:

```ts
interface PluginReleaseTarget {
  pluginName: string
  packageName?: string
  root: string
  manifest: string
  gates: {
    build: CommandSpec
    test: CommandSpec | 'not-applicable'
    typecheck: CommandSpec | 'not-applicable'
    lint: CommandSpec | 'not-applicable'
  }
  bundledProjection?: string
}
```

`not-applicable` requires a reason in the registry. Filesystem discovery alone must not decide what is release-supported.

## Orchestrator

1. verify clean/declared source revision and tool versions;
2. create isolated output roots and remove generated package outputs there;
3. build CLI core and required Vite/TuffEx prerequisites;
4. execute each target's declared gates;
5. build the `.tpex` through canonical CLI core;
6. run package policy, scan and signing;
7. compare bundled projection when configured;
8. emit an audit record.

No step reads an existing target `.tpex` as input.

## Audit Record

Per target:

- source revision and dirty-state decision;
- package/Manifest identity and version;
- command ids, sanitized command labels, exit code and duration;
- toolchain versions;
- normalized entry inventory digest and artifact SHA-256;
- policy/scanner/signing record ids and decisions;
- projection freshness result;
- overall status and stable blockers.

Raw stdout/stderr stays in ignored temporary storage; committed reports contain bounded summaries.

## Reproducibility

The content reproducibility check compares normalized file paths and file SHA-256 values. If tar headers contain nondeterministic timestamps, container-byte reproducibility is reported separately and must not be falsely claimed. The preferred end state is deterministic archive metadata so both content and container digest repeat.

## Existing Release Integration

Reuse the official build ordering and seed freshness concepts already present under `apps/core-app/scripts/lib/`, but move general plugin target ownership to a neutral registry rather than adding a second handwritten list. CoreApp seed projection remains a consumer.

## Failure/Rollback

The orchestrator stops at the first failed prerequisite or target gate and emits a failed audit without publishing. A previous artifact is never overwritten as “latest” by a failed run. Rollback selects a previous audited artifact by digest; it does not rebuild from dirty source.
