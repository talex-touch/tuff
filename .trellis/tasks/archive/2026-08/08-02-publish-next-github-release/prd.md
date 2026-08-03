# 发布 v2.4.14-beta.2 GitHub Release

## Goal

Prepare and publish `v2.4.14-beta.2` as a verified GitHub prerelease from the current committed `master` baseline.

## Requirements

- Advance root and CoreApp versions from `2.4.14-beta.1` to `2.4.14-beta.2`.
- Add the exact bilingual release-note pair required by `notes/RELEASE_NOTES_GUIDE.md`, covering only committed changes since `v2.4.14-beta.1`.
- Exclude all pre-existing uncommitted CoreApp, Nexus IPC documentation, storage, and spec work from the release commit and tag.
- Run the deterministic release-note, version, diff, and focused package gates before publication.
- Publish through the repository's annotated-tag workflow and require the GitHub Release to be non-draft, prerelease, signed, and backed by the expected Windows, macOS, and Linux assets.
- Treat the user's explicit GitHub Release request as authorization to commit the release metadata and push `master` plus `v2.4.14-beta.2`; do not deploy Cloudflare separately.

## Acceptance Criteria

- [x] Root and CoreApp package versions are exactly `2.4.14-beta.2`, and bilingual notes pass the strict release-note contract.
- [x] The release commit contains only the two package version updates, two release-note files, and this task's Trellis metadata.
- [x] Local release gates pass without modifying or staging unrelated dirty worktree files.
- [x] `v2.4.14-beta.2` is an annotated tag on the verified release commit and is pushed to `origin`.
- [x] GitHub publishes a non-draft prerelease with the generated manifest, signatures, release-test summary, and preferred platform packages.
- [x] The task records the workflow and release URLs plus final publication evidence before archival.

## Evidence

- Release commit/tag: `154508d50823cd4e02409c7a3a79c20a27a0fa16` / `v2.4.14-beta.2`; remote `master` and dereferenced tag resolve to the same commit.
- Local gates: strict bilingual notes and version verification passed; release signing trust roots matched; `git diff --check`, frozen lockfile, Nexus MDC fences, 25 focused Nexus credential tests, and all 919 TuffEx tests passed.
- GitHub Actions run `30779316931` succeeded for Windows, macOS, Linux, Create Release, and Sync Nexus Release: https://github.com/talex-touch/tuff/actions/runs/30779316931
- GitHub Release is non-draft and prerelease with 17 assets: https://github.com/talex-touch/tuff/releases/tag/v2.4.14-beta.2
- `release-test-summary.json` reports `pass`: 3 unique preferred platform assets, all 4 published packages signed, SHA-256 checks valid, and macOS Developer ID, Gatekeeper, and notarization checks passed.
- The downloaded `tuff-release-manifest.json` passed repository validation with 3 platform/architecture artifacts; Nexus reports `v2.4.14-beta.2` as published and latest for the BETA channel.

## Notes

- Target range: `v2.4.14-beta.1..HEAD` at release preparation time.
- Cloudflare Preview/Production deployment is outside this task.
