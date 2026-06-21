# Native Screenshot Rust Test Report

Date: 2026-06-21

## Scope

This report covers the Rust native screenshot addon at:

- `packages/tuff-native/native-screenshot/src/lib.rs`
- `packages/tuff-native/native-screenshot/build.rs`

The focused change set improves support detection, region validation, and Rust-level test coverage for the N-API screenshot bridge.

## Results

| Check | Command | Result |
| --- | --- | --- |
| Rust formatting | `cargo fmt --manifest-path packages/tuff-native/native-screenshot/Cargo.toml` | Passed |
| Rust unit tests | `CARGO_BUILD_JOBS=1 cargo test --manifest-path packages/tuff-native/native-screenshot/Cargo.toml -- --nocapture` | Passed, 9 tests |
| Release addon build | `pnpm -C packages/tuff-native run build:screenshot` | Passed |
| JS native contract | `pnpm -C packages/test exec vitest run src/native/tuff-native-screenshot.test.ts` | Passed, 3 tests |

## Rust Unit Test Cases

The Rust tests cover:

- supported platform with available monitors reports `supported=true`;
- unsupported platform reports `platform-not-supported`;
- supported platform with zero monitors reports `no-display-available`;
- monitor probe failure reports `xcap-monitor-probe-failed: ...`;
- in-bounds capture regions are accepted;
- zero-sized capture regions are rejected;
- unavailable display bounds are rejected;
- out-of-bounds capture regions are rejected;
- overflowing region bounds are rejected.

## Notes

- `cargo test` for this N-API crate needs test-only N-API reference release stubs because the normal Rust test binary is not loaded by Node.js and does not provide `_napi_delete_reference` / `_napi_reference_unref`.
- Raw command logs were also written locally as `.log` files in this folder, but repository `.gitignore` ignores `*.log`.
