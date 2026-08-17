# touch-translation 本地跑通

父任务：`08-15-local-store-three-plugins`。依赖 `08-15-local-nexus-publish-path`。

## Goal

让 `plugins/touch-translation` 在本地 Nexus 上完成发布、上架、安装，并验证翻译功能与密钥存储路径。

## Background

仓库内插件已从 v1.0.11 修复到 v1.0.17，sdkapi 260713。权限面是三个里最大的：
`network.internet`、`intelligence.basic`、`storage.plugin`、`search.root-results` 为必需，
`clipboard.write` 为可选，每项都写了 reason。manifest 里明确「隔离 Prelude 不直接联网」，
联网只发生在设置 Surface，密钥由安全存储管理——这条设计约束必须在验证中确认仍然成立。

本地 D1 里的旧记录是 `com.tuffex.translation` **1.0.0-Alpha / SNAPSHOT**，对 public audience 不可见。
注意 `tuff publish` 会按 tag 推断 channel，tag 含 `alpha` 会被判成 SNAPSHOT，本次必须确保发的是 RELEASE。

## Requirements

1. 构建产物可用，`manifest.version` 与 `package.json.version` 一致。
2. 以 `--channel RELEASE` 发布到本地 Nexus 并通过审核。
3. 在核心应用市场中可搜索、可安装、可启用。
4. 配置一个翻译源后能完成一次真实的文本翻译。
5. 密钥走 plugin secret capability，普通 plugin storage 中不得出现明文密钥。
6. secret 写入失败时 fail-closed，不得出现「普通配置已更新但密钥丢失」的中间态。
7. SDK 适配：`sdkapi` 从 `260615` 提到 `260713`，确认 `260626`（SemanticAliasSDK）与
   `260713`（i18n / Domain Lexicon facade）对本插件是否适用——该插件有中英双语搜索关键词，
   localization facade 是最可能真正用得上的一个；并核对现有调用面无废弃项。

## Acceptance Criteria

- [x] `/api/store/plugins?compact=1` 中出现该插件，`latestVersion.channel === 'RELEASE'`。
- [x] 市场搜索「translation」「翻译」能命中。
- [x] 安装成功，出现在「已安装」列表且可启用。
- [x] 配置一个翻译源后，一段文本能被成功翻译并展示结果。
- [x] 在插件的普通 storage 文件中检索配置的密钥字符串，**搜不到明文**。
- [x] 拒绝 `network.internet` 或 `intelligence.basic` 时，翻译动作给出明确的权限拒绝反馈而不是超时或空结果。
- [x] `manifest.sdkapi === 260713`，且在该版本下上述功能、权限与密钥验收项全部重测通过。

## Constraints

- 不把 API key 写进普通 plugin storage，即使是临时调试。
- 不让 Prelude 直接联网，保持 manifest 声明的隔离边界。
- 报告与日志中不得出现真实 API key。

## Non-Goals

- 新增翻译服务商或改动 provider 配置模型。
- 重构 OCR / 图片翻译链路。
- 发布到生产。
