# 发布设计

## Flow

```text
beta.23 release + installed runtime evidence
  -> delete authorized stale empty draft
  -> local quality:release
  -> version 2.4.13 commit
  -> annotated v2.4.13 tag
  -> push master + tag
  -> Windows/macOS/Linux stable builds
  -> signed manifest + release summary
  -> non-prerelease GitHub Release
  -> Nexus stable metadata/assets/publish
```

## Gates

- 远端基线：`origin/master...HEAD = 0/0`，目标 tag 不存在。
- 本地门禁：`pnpm quality:release`、`git diff --check`、工作区 clean。
- CI 门禁：三平台 build、macOS signing、Windows installer、manifest signature、release summary。
- 发布门禁：GitHub `draft=false`、`prerelease=false`；Nexus sync/publish success。
- 证据门禁：下载 manifest/summary，验证 tag/version/channel、artifact matrix、rollback metadata。

## Failure Policy

- 本地门禁失败：停止，不改版本、不推送。
- master 推送失败：不推 tag。
- tag workflow 失败：保留不可变证据，不删除 tag或重写 commit。
- GitHub Release 成功但 Nexus 失败：报告部分发布失败，修复同步链路，不重新上传未验证资产。
