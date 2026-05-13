# Tuff v2.4.10-beta.19 Release Notes

## Highlights

- Prepared the `2.4.10-beta.19` test package for the recent Windows app index, app icon cache stability, and macOS `.app` file-preview filtering fixes.
- Added an explicit `beta` manual build type to `build-and-release`; beta tags now resolve to beta release semantics and stay marked as GitHub pre-releases.
- Beta builds now keep `BETA` runtime metadata while reusing the existing snapshot packaging policy, preventing the client build info from being mislabeled as snapshot.
- Added root and CoreApp `build:beta:*` platform scripts so local and CI beta builds no longer hit a missing workspace script.
- Aligned CI/CD on Node `22.16.0` and pnpm `10.32.1`; release builds now use frozen lockfile installs and approve the registered build scripts non-interactively.
- Changed PR CI from `pull_request_target` to read-only `pull_request`, covering both `main` and `master`, to reduce the permission surface for external PR code.
- Narrowed release artifact uploads to installers, archives, and updater metadata, reducing GitHub Actions artifact size and release aggregation time.

## Known Limitations

- This is still a beta test package and does not mean the stable `2.4.10` release gate is complete.
- Windows real-device acceptance, performance sampling, and Nexus Release Evidence sync remain blockers for the stable release.
