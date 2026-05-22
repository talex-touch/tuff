# 微审计 43/70

- 审计主题：uTools 插件市场对 Tuff Store 的启发是否已经被主文档聚焦到“开发者发布任务流 + 可审计安装链路”，而不是误读成只要补一个市场页面、插件卡片或视觉入口；本轮重点核对 `04` / `08` 的任务流口径与 Nexus dashboard 发布、预览、审核源码是否一致。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
    - 第 1 节把 uTools 强项定义为“入口 + 数据源匹配 + 插件市场”的组合，而不是单一插件商店 UI。
    - 第 2.1 节明确“发布审核”应映射到 Tuff 的 manifest 摘要、权限摘要、平台矩阵、dry-run evidence，并强调不做“上传即上架”。
    - 第 7.1 节把开发者任务流拆成 `tuff create`、本地调试、`tuff validate --strict`、`tuff build`、`tuff publish --dry-run`、Store 安装，每一步都有失败时必须暴露的 reason。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
    - 第 1 节结论明确 Tuff 当前生态底座已经包含 Manifest / Prelude / Surface、`sdkapi` hard-cut、权限、typed SDK、`tuff validate/build/publish --dry-run`、Nexus Store、`.tpex` 包预览、publish auth、CloudShare content pack、版本 pending/approved/rejected 审核状态和 `_files` / `_signature` 完整性校验。
    - 同节也明确真实缺口是“端到端生态 evidence 和产品化任务流”，而不是完整生态重构。
    - 第 5.1 节的 `plugin ecosystem loop v1` 把最小闭环拆成 Manifest、Prelude、Local install、Dry-run publish、Nexus package preview、Submit pending、Store 展示、Content pack install、First run，并要求每步有失败 reason。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 43 条预设审计点是“uTools 插件市场对 Tuff Store 的启发是否聚焦任务流”；台账判断为文档优先端到端 `.tpex` / manifest / validate / Store card evidence，没有只做市场页面 UI。
  - `apps/nexus/server/api/dashboard/plugins/package/preview.post.ts`
    - package preview 入口要求 `plugin:publish` 权限、读取上传的 `package` 文件，并通过 `extractTpexMetadata()` 返回 manifest、README、icon preview 与 `hasIcon`。
    - 这证明 `.tpex` 预览不是纯 UI mock；但当前 preview API 只回传可展示元数据，完整性阻断主要在发布路径完成。
  - `apps/nexus/server/utils/tpex.ts`
    - `extractTpexMetadata()` 会解析 tar、读取 manifest / README / icon，并通过 `verifyManifestIntegrity()` 校验 `manifest._files` 与 `_signature`。
    - 校验逻辑覆盖缺失 manifest、缺 `_files`、缺 `_signature`、包内容与 manifest 文件列表不一致、hash mismatch、signature mismatch 等情况。
  - `apps/nexus/server/api/dashboard/plugins/[id]/versions.post.ts`
    - 发布版本入口要求 `plugin:publish` 权限，强制 version、channel、changelog、package，随后调用 `publishPluginVersion()`。
    - 管理员发布与普通 owner 发布的权限路径区分由 `canModerate` 传入数据层。
  - `apps/nexus/server/utils/pluginsStore.ts`
    - `publishPluginVersion()` 会校验语义版本、禁止重复版本和降级、执行 submission cooldown、记录 upload governance、计算包 SHA-256、解析 `.tpex` metadata、阻断完整性失败、要求 icon、上传包文件，并创建 `pending` 版本。
    - 发布成功后会追加 `version.created` timeline；普通 owner 首次发布会把插件从 `draft` 推到 `pending`，管理员可直接把插件状态推进到 `approved`。
    - `reeditPluginVersion()` 只允许 rejected version 重编辑，并把版本重新置为 `pending`，说明 rejected -> re-edit -> pending 的开发者反馈路径已有数据层支撑。
  - `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
    - 审核状态只允许 `pending` / `approved` / `rejected`，并且只有管理员可以 moderate version。
    - 状态变更会调用 `setPluginVersionStatus()`，同时记录 platform governance event 并发送 notification event。
  - `apps/nexus/app/types/dashboard-plugin.ts` 与 `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
    - Dashboard 类型层已经暴露 version `signature`、`packageUrl`、`packageKey`、`packageSize`、`manifest`、`status`、`reviewedAt`、`rejectReason`、timeline event 等字段。
    - 详情抽屉展示版本 channel/status、创建时间、包大小、rejected reason、下载、re-edit、timeline 与 analytics/review 统计，说明管理端不只是静态卡片。

- 结论：
  - 主文档对 uTools 插件市场的映射方向成立。uTools 的参考价值被放在“低门槛创建 + 市场分发 + 数据源匹配 + 审核发布”这条任务流上，而不是只建议 Tuff 复制一个插件市场页面。
  - Tuff 当前 Nexus 侧也有真实底座支撑这个判断：`.tpex` preview 能读取 manifest / README / icon；发布路径会做语义版本、重复/降级检查、上传治理、包 SHA-256、manifest 完整性校验、icon 要求和 pending version；管理员审核会写入状态、治理事件和通知；管理端能显示版本状态、包大小、reject reason 与 timeline。
  - 但现状仍不能被宣传为完整 uTools / Raycast 式生态闭环。关键缺口是 evidence 和产品化串联：`tuff publish --dry-run`、package preview、submit pending、admin review、Store install、first run、CloudShare content install 还没有沉淀成一条固定样板；package preview 当前也更偏 manifest/README/icon 展示，完整性失败的强阻断主要发生在正式 publish/re-edit 路径。
  - 因此 `08` 提出的 `plugin ecosystem loop v1` 是合理的最小下一步：选 `touch-snippets` 这类低风险官方插件，跑通 manifest -> validate -> build -> dry-run -> preview -> pending -> Store detail -> content install -> first run，并把每一步失败 reason 固定下来。这样比“先补 Store 视觉卡片”更符合 Tuff 的 hard-cut、权限和可审计生态方向。

- 是否发现需修正的主文档问题：否。`04`、`08`、`11` 没有把 Tuff 当前 Store 写成完整市场闭环，也没有把 `.tpex` 完整性校验包装成完整安全审核；它们把现状描述为已有 preview / pending review / integrity 基础，把缺口落到端到端 evidence、risk summary、Store trust summary 和 content pack install 样板，和源码一致。本轮只补一个实现层观察：package preview 当前主要返回 manifest / README / icon 展示数据，发布强校验仍在 `publishPluginVersion()` / `reeditPluginVersion()`，后续做 v1 evidence 时应把这两个阶段的职责区分清楚。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-43.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
