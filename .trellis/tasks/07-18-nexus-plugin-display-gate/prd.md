# 建立 Nexus 插件展示门禁

## Goal

让 Nexus Store 的列表、搜索、详情、版本选择和下载统一消费一个可解释的发布资格判定，杜绝“plugin 已 approved，但 latest version 未通过 policy/scan/signature 仍被展示”的分层绕过。

## Confirmed Facts

- `pluginIsVisible(..., { forStore: true })` 当前只检查 plugin status 为 `approved`。
- `versionIsVisible(..., { forStore: true })` 当前只检查 version status 为 `approved`；latest 选择按 channel priority 和 createdAt。
- publish 创建的版本默认 `pending`，已有 admin review 状态与 timeline，但 version 记录尚无 package policy、scan 和签名资格字段。

## Requirements

1. 定义单一 `PluginReleaseEligibility` projection，组合 plugin/version 审核状态、artifact 存在性、package policy、security scan、signature trust、channel 和撤销状态，并返回 stable reason codes。
2. Store list/search/detail/versions/download 必须调用同一 projection；不得各自重写 status 判断。
3. 默认公开 Store 只选择 eligible `RELEASE`；`BETA` 仅在明确 beta surface/opt-in 下可见，`SNAPSHOT` 仅 owner/admin 可见。
4. latest version 从 eligible 集合选择；无 eligible version 的 plugin 不公开展示，旧 eligible version 在新 pending/rejected 版本存在时继续可用。
5. admin/owner Dashboard 仍可查看失败或 pending 版本及原因，但公共 payload 不泄露内部路径、扫描源码片段或审核私密信息。
6. artifact 删除、签名撤销或 scan/policy 状态回退时，资格即时失效并写 timeline/audit；不得依赖缓存过期后才隐藏。

## Acceptance Criteria

- [ ] plugin approved 但 version 缺 policy/scan/signature 任一条件时，Store list/search/detail/version/download 全部不可达。
- [ ] eligible RELEASE 可公开展示和下载；pending/rejected 新版本不遮蔽上一个 eligible RELEASE。
- [ ] BETA 仅在明确 beta 上下文可见；SNAPSHOT 不出现在公共 Store。
- [ ] eligibility reason codes 在 admin/owner Dashboard 可见，公共响应只返回安全的 availability 状态。
- [ ] artifact missing、signature revoked、scan failed 的状态转换立即从所有公共入口撤下并留下 timeline 证据。
- [ ] memory fallback 与 D1 路径行为一致；focused store API/tests、Nexus typecheck/lint/build guard 通过。

## Out of Scope

- 改造插件商店视觉设计或推荐排序。
- 自动执行人工审核。
- 真实上传采集和 CoreApp 安装验证。
- 插件评分、评论和计费规则。

