# clipboard-history 本地跑通

父任务：`08-15-local-store-three-plugins`。依赖 `08-15-local-nexus-publish-path`。

## Goal

让 `plugins/clipboard-history` 在本地 Nexus 上完成发布、上架、安装，并验证剪贴板历史功能与权限门在核心应用中可用。

## Background

仓库内插件已从 v1.1.10 修复到 v1.1.11，sdkapi 260713，manifest 规范度是三个里最高的：
`permissions.required` 为 `clipboard.read` / `clipboard.write` / `search.root-results`，每项都有 reason，
且声明了 `searchProviders`。因此它适合作为上架链路的**探针插件**（见前置子任务）。

本地 D1 里的旧记录是 `com.tuffex.clipboard.history` 1.0.0 **SNAPSHOT**，对 public audience 不可见——
`channelAllowed` 只放行 `RELEASE`。本次必须发 RELEASE 版本。

## Requirements

1. 构建产物可用，`manifest.version` 与 `package.json.version` 一致（否则 `tuff publish` 直接拒绝）。
2. 以 `--channel RELEASE` 发布到本地 Nexus 并通过审核。
3. 在核心应用市场中可搜索、可安装、可启用。
4. 剪贴板历史的记录与回写功能可用。
5. 权限门按声明生效：permission SDK 缺失或拒绝时 fail-closed，不得继续读写剪贴板。
6. SDK 适配：`sdkapi` 从 `260615` 提到 `260713`，确认 `260626`（SemanticAliasSDK）与
   `260713`（i18n / Domain Lexicon facade）两档新增能力对本插件是否适用，并核对现有调用面无废弃项。

## Acceptance Criteria

- [x] `/api/store/plugins?compact=1` 中出现该插件，`latestVersion.channel === 'RELEASE'`。
- [x] 市场搜索「clipboard」「剪贴板」「历史」能命中。
- [x] 安装成功，出现在「已安装」列表且可启用。
- [x] 复制若干条内容后，插件能列出对应历史记录。
- [x] 选中一条历史能重新写回系统剪贴板（粘贴可验证）。
- [x] 拒绝 `clipboard.read` 权限时，插件给出明确的 `permission-denied` 类反馈，而不是空列表或静默失败。
- [x] `manifest.sdkapi === 260713`，且在该版本下上述功能与权限验收项全部重测通过。

## Constraints

- 不放宽 manifest 里已声明的权限，也不新增未使用的权限。
- 不使用宿主 `copy` action 绕过插件自身的 `clipboard.write` gate。
- 日志与证据里不得出现剪贴板真实内容。

## Non-Goals

- 重构剪贴板历史的存储或 UI。
- 与核心应用内置剪贴板模块的能力合并或去重。
- 发布到生产。
