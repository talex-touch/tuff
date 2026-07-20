# CLI Shim Retirement - Implementation Plan

## Ordered Checklist

1. [x] Run symbol/reference and package-manifest inventory for `tuffcli`, legacy unplugin CLI bin, duplicate exporter/security/compress utilities and all `/vite` consumers.
2. [x] Compare canonical and legacy exporter behavior; migrate only still-required behavior into `tuff-cli-core` with shared contract tests.
3. [x] Route `tuff build`/`tuff builder` exclusively through CLI core and keep `unplugin-export-plugin/vite` as the Vite integration boundary.
4. [x] Migrate official plugin scripts, package dependencies, documentation and tests to `tuff` and canonical builder.
5. [x] Remove duplicate exporter/security/compress code and obsolete exports from unplugin package.
6. [x] Remove unplugin CLI bin/forwarder, `tuffcli` bin, default command fallback and compatibility environment labels.
7. [x] Update `package.json`, tsup configs, package files lists and `pnpm-lock.yaml`; preserve acyclic dependency direction.
8. [x] Build and pack CLI/unplugin packages; inspect tarballs for one `tuff` bin, expected `/vite` exports and no legacy implementation.
9. [x] Clean-install packed packages into a fixture plugin and run validate, builder, dry-run publish and Vite dev/build smoke.
10. [x] Run final repository reference audit; no aliases/re-exports remain.

## Contract Tests

- `tuff` command resolution/help/error labels;
- packed tarball bin/export inventory;
- canonical builder parity fixtures including widgets/index/prelude/assets;
- unplugin `/vite` integration remains functional;
- old `tuffcli`/legacy bin is absent and not silently forwarded;
- all official plugin build scripts succeed through canonical path;
- package dependency graph contains no legacy CLI cycle.

## Verification Commands

```bash
corepack pnpm -C packages/tuff-cli-core test
corepack pnpm -C packages/tuff-cli-core run build
corepack pnpm -C packages/tuff-cli run build
corepack pnpm -C packages/unplugin-export-plugin test
corepack pnpm -C packages/unplugin-export-plugin run build
corepack pnpm plugins:validate
# npm/pnpm pack inspection and clean fixture install
corepack pnpm lint:changed
git diff --check
```

## Risky Files

- CLI bin/package exports and tsup noExternal configuration.
- Dynamic `/vite` imports used by dev/build.
- Plugin package manifests with published legacy dependencies.
- Lockfile changes and packed artifact contents.

## Rollback

Rollback all three package versions together. Do not restore only a forwarding bin or duplicate exporter, because that would bypass canonical policy/scan/signing behavior.
