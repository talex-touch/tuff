# 微审计 65/70

- 审计主题

Nexus Store version moderation 是否已经有真实基础。重点映射 Raycast Store review / Alfred Gallery curated / uTools 插件市场审核心智，核对 Tuff 当前是否真实支持插件版本 `pending` / `approved` / `rejected`、reject reason、审核通知 / 治理事件，以及 Store 只暴露 approved 版本的边界。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
   - 第 1 节明确：Nexus 有 `.tpex` 上传、包解析、版本状态、审核、通知和治理事件，但 package policy / security scan 仍主要是规划和完整性校验，不能对外宣称 Raycast 式完整审核安全链。
   - 第 3 节证据快照把审核状态写为：插件和版本有 `draft` / `pending` / `approved` / `rejected`；管理员可 moderate 版本并写 reject reason；缺口是审核队列、自动 scan、开发者反馈 UI 仍需证据。
   - 第 4 节生态差距矩阵把审核缺口定位为自动 security scan、审核队列、开发者 re-edit 指引不完整，而不是“没有审核状态”。
   - 第 5.1 节最小闭环把 `Submit pending` 的验收写成 version status、review notification、governance event。
   - 第 5.3 节要求 Store 只展示 latest approved version；未审核版本不应伪装为可安装。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 65 条已将问题缩小为：Nexus Store version moderation 是否有基础；结论草案是 pending / approved / rejected 与 reject reason 基础存在，缺 review evidence 和 capability card。
3. `apps/nexus/server/utils/pluginsStore.ts`
   - `PluginVersionStatus = 'pending' | 'approved' | 'rejected'`，`DashboardPluginVersion` 含 `reviewedAt` 与 `rejectReason`。
   - D1 schema 与 storage fallback 都保存 version `status`、`reviewed_at`、`reject_reason`。
   - `versionIsVisible()` 在 `forStore` 下只返回 `version.status === 'approved'`；非管理员 / 非 owner 也只能看 approved version。
   - `resolvePendingReviewMeta()` 计算 `hasPendingReview` 与 `pendingReviewCount`，说明审核待处理状态不是纯 UI 文案。
   - `publishPluginVersion()` 新版本默认 `status: 'pending'`、`reviewedAt: null`、`rejectReason: null`。
   - `setPluginVersionStatus()` 会更新 version status；approved 时写 `reviewedAt`，rejected 时写 `rejectReason`，并追加 `version.status.changed` timeline event。
   - `reeditPluginVersion()` 只允许 rejected version 重新编辑，重新上传后把状态重置为 `pending` 并清空 `rejectReason`。
4. `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
   - 只允许 `pending` / `approved` / `rejected` 三种状态。
   - 通过 `requireAuth()` 与用户 role 判断限制为管理员审核；非管理员返回 403。
   - 调用 `setPluginVersionStatus()` 后，记录 `plugin.version.approved` / `plugin.version.rejected` / `plugin.version.pending` governance event。
   - 同步 `dispatchNotificationEvent()`，metadata 中包含 `pluginId`、`pluginSlug`、`developerId`、`versionId`、`version`、`status`。
5. `apps/nexus/server/api/store/plugins.get.ts`、`apps/nexus/server/api/store/plugins/[slug].get.ts`、`apps/nexus/server/api/store/plugins/[slug]/versions.get.ts`
   - Store API 获取插件时都传 `forStore: true`。
   - 因 `pluginsStore.ts` 的 `versionIsVisible()` 约束，Store list/detail/versions 只会拿到 approved version。
   - Store response 会保留 version `channel`、`version`、`signature`、`packageSize`、`changelog`、`createdAt` 等展示 / 下载必要字段。
6. `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
   - 版本历史中展示 channel badge、version status badge、package size、changelog。
   - rejected version 有 `rejectedReason` 文案展示。
   - `canEdit && version.status === 'rejected'` 时展示重新编辑按钮，能触发 `reeditVersion`。
7. `apps/nexus/app/types/dashboard-plugin.ts`
   - 前端类型 `VersionStatus = 'pending' | 'approved' | 'rejected'`，`DashboardPluginVersion` 含 `reviewedAt` 与 `rejectReason`。
8. `apps/nexus/test/api/dashboard/plugins/version-notification.api.test.ts`
   - 测试读取版本审核 API 源码，确认版本审核会触发 `dispatchNotificationEvent()`，approved / rejected 路由到对应 action，并把通知上下文绑定到 plugin developer。

- 结论

主文档对 Nexus Store version moderation 的判断成立：Tuff 当前不是只有 Store 卡片或 `.tpex` 上传壳，版本审核基础链路已经存在。

已经成立的具体能力：

1. **版本状态模型真实存在**：后端和前端类型都固定为 `pending` / `approved` / `rejected`，新发布版本默认进入 `pending`。
2. **管理员审核入口真实存在**：版本 patch API 限制管理员修改状态，非法状态会被拒绝，非管理员不能 moderate。
3. **reject reason 真实保存和展示**：rejected 状态会写 `rejectReason`；Dashboard 版本历史会显示驳回原因。
4. **re-edit 路径有基本约束**：只有 rejected version 能重新编辑，重新上传后回到 `pending`，避免直接修改已 approved package。
5. **Store 公共面有可见性保护**：`forStore: true` 下只暴露 approved plugin / approved version，未审核版本不会被公共 Store 当成可安装版本。
6. **通知与治理事件有基础**：审核 API 会写 governance event，并发送 version moderation notification 到 developer context。

仍需保持主文档里的未完成口径：

1. 当前审核不是完整 Raycast Store review parity。完整性校验、状态流和 reject reason 不等于恶意代码扫描或人工审核 SOP。
2. 审核队列、risk summary、capability card、permission risk、sdkapi / integrity / package policy 的合并展示仍不完整。
3. `version-notification.api.test.ts` 是源码 contract 测试，能防止通知字段漂移，但不是端到端通知投递 evidence。
4. Store 详情能拿到 approved versions，但 trust summary 还没有把 approved status、integrity、sdkapi、permission risk、downloads、rating、last validated 合并成用户一眼可见的信任摘要。

因此后续最小动作应保持在 `08` 的 P1 范围：做一个审核队列 / version moderation evidence 样本，展示 package preview、integrity、sdkapi、permissions、risk summary、reject reason 与 notification result；不要把现有 moderation 基础包装成完整安全审核，也不要为了“像应用市场”放松 `sdkapi hard-cut` 或 package integrity 规则。

- 是否发现需修正的主文档问题

否。`08-plugin-store-sdk-ecosystem.md` 与 `11-100-round-cross-review-ledger.md` 对该点的口径与 live source 一致：Nexus 已有 pending / approved / rejected、reject reason、Store approved-only 可见性、通知和治理事件基础；缺口仍是 review evidence、capability card、risk summary、审核队列与完整 security scan。没有发现需要修改 01-11 主分析文档的问题。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-65.md`，并更新 `.codexpotter` 进度记录。未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
