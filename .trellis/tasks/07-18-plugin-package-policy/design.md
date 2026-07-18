# Plugin Package Policy - Design

## Ownership

Create a platform-neutral policy module under `packages/utils/plugin/` and export it from the existing plugin surface. It owns types, constants, normalization and deterministic validation. CLI and Nexus provide adapters only.

## Core Types

```ts
interface PluginPackageEntry {
  path: string
  type: 'file' | 'directory' | 'symlink' | 'hardlink' | 'device' | 'other'
  size: number
}

interface PluginPackagePolicyInput {
  profile: 'source-manifest' | 'staged-package' | 'registry-admission'
  manifest: unknown
  entries?: readonly PluginPackageEntry[]
  archiveSize?: number
  expected?: { pluginId?: string; pluginName?: string; version?: string }
}

type PluginPackagePolicyResult =
  | { ok: true; policyVersion: string; identity: NormalizedPluginIdentity; inventory?: NormalizedInventory }
  | { ok: false; policyVersion: string; violations: readonly PluginPackageViolation[] }
```

Violations carry stable `code`, `location` and bounded metadata. Messages are presentation-only.

## Validation Profiles

- `source-manifest`: identity, SemVer, SDK/category and permission shape. `_files/_signature` and archive inventory are not required.
- `staged-package`: source rules plus packaged `dev` state, root Manifest, inventory limits and `_files` coverage.
- `registry-admission`: staged rules plus expected Nexus identity/version and hard 30 MB compressed limit.

## Path and Inventory Normalization

- Parse archive metadata before extraction.
- Reject NUL, backslash, drive/UNC, leading slash, empty segment, `.`/`..`, duplicate normalized path and case-fold collision.
- Require exactly one regular root `manifest.json`.
- Directories are allowed; symlink, hardlink, device, fifo and unknown entries are rejected.
- Count compressed size, regular-file count, per-file size and aggregate expanded bytes with checked integer arithmetic.
- Compare `manifest._files` to regular package content using normalized paths; `manifest.json` and transitional `key.talex` handling are explicit policy-version rules, not implicit basename skips.

## Manifest Normalization

- `id`: reverse-domain identifier with at least three safe segments.
- `name`: canonical slug string; localized display names remain separate metadata.
- `version`: strict SemVer accepted by CLI and Nexus.
- `sdkapi`: existing shared compatibility resolver is authoritative.
- `category`: required at the existing SDK threshold.
- permissions: normalize through the existing permission registry; unknown values are violations in strict profiles.
- packaged dev configuration must disable source and remote address.
- `main` is optional because UI-only runtime plugins are valid.

## Boundary Adapters

- CLI `validate`: `source-manifest`.
- CLI builder: validate source before work and `staged-package` immediately before compression.
- Nexus tar parser: expose complete entry metadata and integrity separately.
- Nexus preview/publish: require integrity and `registry-admission`; map first violation code to a safe 400 response while retaining the complete bounded report for audit.

## Compatibility

Run all repository plugin Manifests through the new source profile before hard cut. Any incompatibility is fixed at canonical source; no alias validator remains. Policy version is persisted so later rules can shadow-evaluate before enforcement.

## Rollback

Nexus may temporarily select the previous policy evaluator for new admissions, but historical decisions remain immutable. Rollback never permits a package that violates archive safety primitives.
