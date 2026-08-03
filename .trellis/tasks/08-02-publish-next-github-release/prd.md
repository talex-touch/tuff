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
- [ ] The release commit contains only the two package version updates, two release-note files, and this task's Trellis metadata.
- [x] Local release gates pass without modifying or staging unrelated dirty worktree files.
- [ ] `v2.4.14-beta.2` is an annotated tag on the verified release commit and is pushed to `origin`.
- [ ] GitHub publishes a non-draft prerelease with the generated manifest, signatures, release-test summary, and preferred platform packages.
- [ ] The task records the workflow and release URLs plus final publication evidence before archival.

## Notes

- Target range: `v2.4.14-beta.1..HEAD` at release preparation time.
- Cloudflare Preview/Production deployment is outside this task.
