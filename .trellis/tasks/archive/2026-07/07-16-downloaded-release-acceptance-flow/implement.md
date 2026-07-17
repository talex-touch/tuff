# Implementation plan

## Execution order

1. Resolve root/CoreApp versions and target tag; confirm the host platform/architecture and clean working tree.
2. Query the authenticated GitHub Release and save a normalized asset inventory in task evidence.
3. Run the existing remote release gate against `https://tuff.tagzxia.com`; save the full JSON result even when Gate E fails.
4. Create `/tmp/tuff-release-acceptance/<tag>/downloads` and download only the manifest plus the host macOS arm64 ZIP.
5. Validate the manifest, compute local SHA-256, and compare manifest/GitHub/local values.
6. Extract the ZIP under the temporary root and inspect bundle version, executable architecture/permission, codesign, and Gatekeeper.
7. If the bundle version/architecture/executable checks are safe, run the packaged indexing diagnostics probe with a disposable userData path and task-local evidence output.
8. Verify the supervised process exits and remove temporary userData/download/unpacked paths after recording sizes and digests.
9. Write a compact evidence summary with explicit `pass`/`fail`/`blocked`/`static-only` classifications; do not copy secrets, signed query strings, full logs, or personal paths.
10. Add a release-testing guide under `.trellis/spec/frontend/`, link it from the spec index, and define the “发版测试” trigger and exact gate order.
11. Run task validation, relevant release-gate/manifest/probe tests for any changed tooling, AI-doc/spec checks if applicable, and `git diff --check`.
12. Review any failed release gate with the user before opening separate defect work; do not fix product behavior inside this task.

## Validation commands

- `gh release view <tag> --repo talex-touch/tuff --json ...`
- `node scripts/check-release-gates.mjs --tag <tag> --version <version> --stage gate-e --base-url https://tuff.tagzxia.com`
- `gh release download <tag> --repo talex-touch/tuff --pattern ... --dir <temporary-download-root>`
- `node scripts/update-validate-release-manifest.mjs --manifest <downloaded-manifest>`
- `shasum -a 256 <downloaded-host-asset>`
- `/usr/bin/ditto -x -k <zip> <unpacked-root>`
- `/usr/bin/plutil`, `/usr/bin/file`, `/usr/bin/codesign --verify --deep --strict`, `/usr/sbin/spctl --assess --type execute`
- `pnpm -C apps/core-app run visible:experience:indexing-diagnostics-probe -- --appBundle <downloaded-app> --userDataDir <temporary-profile> --outputDir <task-evidence-dir> --seedRecentTaskEvidence`
- `python3 ./.trellis/scripts/task.py validate <task>`
- `git diff --check`

## Review gates

- Do not launch when local SHA, bundle version, architecture, or executable checks mismatch.
- Do not install or re-sign when codesign/Gatekeeper fails; record the failure and continue only with direct isolated execution if macOS permits it without security-policy mutation.
- Do not mark Windows/Linux runtime as passed from macOS evidence.
- Do not preserve raw downloaded packages or userData in Git.

## Cleanup

- Stop the supervised packaged process through the probe's own lifecycle.
- Remove `/tmp/tuff-release-acceptance/<tag>` after curated evidence is complete.
- Keep only bounded JSON/Markdown summaries and intentionally captured screenshots under task evidence.
