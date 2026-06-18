# Report Hygiene: CoreApp AI Stable 2026-06-18

> 状态：瘦身建议 / 不删除文件
> 目的：区分可提交 evidence 与本地 raw probe 产物，避免 `docs/engineering/reports` 持续膨胀。

## Commit-worthy set

Keep these files as the minimum reviewable report surface:

- `README.md`
- `REPORT-HYGIENE.md`
- `COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`
- `coreapp-visible-experience-manifest.json`
- `coreapp-visible-readiness.json`
- `coreapp-visible-readiness-output.json`
- `coreapp-visible-readiness-exit-code.txt`
- `coreapp-visible-strict-verify-output.json`
- `coreapp-visible-strict-verify-exit-code.txt`
- `packaged-cdp-live-capture.json`
- `packaged-cdp-page-03.png`
- `packaged-corebox-hotkey-capture.json`
- `packaged-corebox-hotkey-page-04.png`
- `packaged-ai-ask-provider-enabled-probe.json`
- `packaged-ai-ask-provider-enabled-after-enter.png`
- `packaged-ai-ask-runtime-permission-denied-probe.json`
- `packaged-ai-ask-runtime-permission-denied-after-enter.png`

## Raw / local-only candidates

The following categories are not required by the manifest and should be moved to `raw/` or `_local/` before future commits, or removed after human review:

- `*.log`
- `*-pid.txt`
- `*-probe-output.json`
- `*-capture-output.json`
- `*-dom-probe-output.json`
- duplicate stage screenshots such as `*-before-input.png` and `*-after-input.png`
- failed exploratory probes that did not produce accepted evidence, including startup-time missing-permission runs that only show plugin enable blocking
- stale CDP target dumps used only to debug the capture chain

## Current accepted evidence mapping

- CoreBox entry visibility: `packaged-corebox-hotkey-capture.json`, `packaged-corebox-hotkey-page-04.png`
- Packaged CDP screenshot chain: `packaged-cdp-live-capture.json`, `packaged-cdp-page-03.png`
- AI-STABLE-06 model/capability unsupported partial: `packaged-ai-ask-provider-enabled-probe.json`, `packaged-ai-ask-provider-enabled-after-enter.png`
- AI-STABLE-07 permission denied partial: `packaged-ai-ask-runtime-permission-denied-probe.json`, `packaged-ai-ask-runtime-permission-denied-after-enter.png`

## Ignore policy

The repository `.gitignore` now ignores future raw/local report material under:

- `docs/engineering/reports/**/_local/`
- `docs/engineering/reports/**/raw/`
- `docs/engineering/reports/**/*-pid.txt`
- `docs/engineering/reports/**/*-probe-output.json`
- `docs/engineering/reports/**/*-capture-output.json`
- `docs/engineering/reports/**/*-dom-probe-output.json`

Existing tracked files are not removed by `.gitignore` automatically; this report has been explicitly cleaned after review.

## Cleanup result

- Removed 57 previously tracked raw report files from the Git index.
- Moved 69 local raw files into the ignored `raw/` directory.
- Kept the curated top-level report directory to 17 files: summary docs, manifest/checklist, readiness/strict outputs, and accepted evidence screenshots/JSON.
- Preserved local raw files for debugging; they are ignored by `docs/engineering/reports/**/raw/` and should not be committed.

If future raw files accidentally become tracked, use a dedicated reviewed cleanup command:

```bash
git rm --cached <tracked-raw-file> [...]
```

This keeps the working-tree files available locally while removing them from future commits.
