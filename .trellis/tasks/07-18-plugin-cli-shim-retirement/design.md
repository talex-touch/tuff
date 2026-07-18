# CLI Shim Retirement - Design

## Final Ownership

- `@talex-touch/tuff-cli-core`: validate, builder/exporter, publish, auth/config and supply-chain clients.
- `@talex-touch/tuff-cli`: command parsing, UX, i18n and the sole `tuff` bin.
- `@talex-touch/unplugin-export-plugin`: Vite plugin/dev virtual-module integration only.

No package keeps a second compressor, Manifest generator, security utility or CLI forwarder.

## Current Compatibility Surfaces

- `tuff-cli` publishes both `tuff` and `tuffcli` bins and defaults command labels to `tuffcli` in places.
- `unplugin-export-plugin` has a deprecated CLI bin that forwards into `tuff-cli`.
- `unplugin-export-plugin/src/core/exporter.ts` duplicates builder/compress/signature logic.
- `tuff-cli` bundles both CLI core and legacy unplugin modules; Vite commands still need the unplugin `/vite` entry.

## Migration Phases

1. Inventory every bin, dynamic import, package dependency, script, test and documentation reference.
2. Move any still-unique exporter behavior into canonical CLI core with contract tests.
3. Route `tuff build` and `tuff builder` exclusively to CLI core while retaining `/vite` for dev/build integration.
4. Migrate all official plugin scripts/docs and verify clean package builds.
5. Remove duplicate exporter/security/compress code and obsolete exports from unplugin package.
6. Remove unplugin CLI bin/forwarder and `tuffcli` alias; update package files, tsup config and lockfile.
7. Pack-install the resulting CLI and inspect bins/module graph.

## Compatibility Decision

This is a clean cutover. There is no runtime alias or deprecated re-export after release. Invoking an old binary from an old installed package may print a static migration error, but the current packages do not ship a forwarding shim.

## Vite Boundary

The unplugin `/vite` API remains supported. Its implementation may call shared CLI-core helpers only when that does not pull Node CLI UX into Vite runtime. Package dependency direction must remain acyclic.

## Verification

- repository reference audit for `tuffcli`, legacy bin and duplicate exporter imports;
- CLI core + CLI build/tests;
- unplugin Vite tests;
- clean official plugin build using `tuff`;
- packed npm tarball inspection proving one bin and no legacy CLI implementation;
- docs command audit.

## Rollback

Rollback restores the previous package versions as a unit. It must not reintroduce a partial mixed state where `tuff` uses canonical policy while `tuffcli` bypasses it.
