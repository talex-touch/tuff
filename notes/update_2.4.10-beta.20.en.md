# Tuff v2.4.10-beta.20 Release Notes

## Highlights

- Fixed the CI/CD release build failure in the `afterPack` stage when resolving esbuild optional platform dependencies.
- Packaged runtime dependency collection now skips optional runtime dependencies for non-target platforms, preventing Linux/macOS/Windows builds from being blocked by packages such as `@esbuild/aix-ppc64`.
- Target-platform esbuild native binaries are still verified fail-fast, so a genuinely missing binary for the current platform will not be silently published.
- Added runtime modules contract coverage for the optional dependency skip behavior.
- Verified the fix with a `workflow_dispatch` beta build: Windows, macOS, and Linux builds, artifact verification, and artifact uploads all passed.

## Known Limitations

- This is still a beta test package and does not mean the stable `2.4.10` release gate is complete.
- Windows real-device acceptance, performance sampling, and Nexus Release Evidence sync remain blockers for the stable release.
- GitHub Actions now warns that Node.js 20 actions will default to Node.js 24 starting 2026-06-02; the related actions still need a separate upgrade and verification pass.
