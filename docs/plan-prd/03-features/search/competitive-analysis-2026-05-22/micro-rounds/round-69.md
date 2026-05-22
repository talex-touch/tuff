# 微审计 69/70

## 审计主题

Nexus Store / Raycast Store / uTools 插件市场里的“版本审核反馈”心智，是否能准确映射到 Tuff 当前插件版本 `pending` / `approved` / `rejected` 状态、拒绝原因、时间线、通知与治理事件链路，而不是被误写成已经具备完整 Raycast Store review parity。

本轮只审一个窄点：Tuff 是否已经有真实的版本审核反馈底座；同时确认主文档把缺口定位为“审核队列、risk summary、开发者 re-edit 指引和端到端 evidence 仍需产品化”，而不是否认已有 moderation 状态或过度宣称完整安全审核。

## 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
   - 第 1 节把插件版本 `pending` / `approved` / `rejected` 审核状态列为已有底座，同时明确 package policy / security scan 仍主要是规划与完整性校验，不能宣称 Raycast 式完整审核安全链。
   - 第 4 节把“审核”拆成当前已有状态与 reject reason，但缺自动 security scan、审核队列和开发者 re-edit 指引。
   - 第 5 节要求 `submit pending`、Store 展示、失败 reason 进入最小生态闭环。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 65 条确认 Nexus Store version moderation 有基础：`pending` / `approved` / `rejected` 与 reject reason 存在；缺 review evidence 和 capability card，文档 P1 合理。
3. `apps/nexus/server/utils/pluginsStore.ts`
   - `DashboardPluginVersion` 记录 `status`、`reviewedAt`、`rejectReason`。
   - `setPluginVersionStatus()` 只允许版本状态落到 `pending` / `approved` / `rejected`，审核通过时写 `reviewedAt`，拒绝时写 `rejectReason`。
   - 状态变化后会追加 `version.status.changed` timeline event，并记录 `fromStatus`、`toStatus`、`reason`、`version`、`channel`。
   - `publishPluginVersion()` 发布成功后把新版本初始状态设为 `pending`，说明提交不会直接伪装成已上架。
   - rejected version re-edit 路径只允许被拒绝版本重新编辑，重新提交后状态回到 `pending`，并清空旧 `reviewedAt` / `rejectReason`。
4. `apps/nexus/server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`
   - 版本 moderation API 要求管理员身份。
   - 只接受 `pending` / `approved` / `rejected` 三类状态。
   - 状态变化后会记录 platform governance event，并通过 `dispatchNotificationEvent()` 发出 `plugin.version.approved` / `plugin.version.rejected` / `plugin.version.pending` 通知。
   - 通知 metadata 明确包含 `pluginId`、`pluginSlug`、`userId`、`developerId`、`versionId`、`version`、`status`，能把审核结果路由到插件开发者上下文。
5. `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
   - 版本列表展示 channel、版本 status badge、创建日期、包大小、changelog。
   - 被拒绝版本如果有 `rejectReason`，会直接显示拒绝原因。
   - rejected version 在可编辑场景下显示 re-edit 操作。
   - timeline 区展示 `version.status.changed` 等事件，并在 `item.reason` 存在时展示 reject reason。
6. `apps/nexus/test/api/dashboard/plugins/version-notification.api.test.ts`
   - 结构测试确认版本审核 API 会触发通知，并把 `plugin.version.approved` / `plugin.version.rejected` 路由到 `plugin.userId` / `developerId`。

## 结论

主文档的边界判断成立：Tuff 已经有真实的插件版本审核反馈底座，但它仍不是完整 Raycast Store review 或成熟插件市场审核体系。

当前已经成立的链路：

1. **版本状态不是占位字段**：新版本提交后进入 `pending`，管理员可以改为 `approved` 或 `rejected`，状态会持久化到版本记录。
2. **拒绝原因有数据闭环**：`setPluginVersionStatus()` 会把 rejected reason 写入版本，并进入 timeline event；前端版本列表和 timeline 都能展示 reason。
3. **审核反馈能通知开发者**：moderation API 会发 `plugin.version.approved` / `plugin.version.rejected` / `plugin.version.pending` 事件，并带开发者上下文。
4. **re-edit 路径有边界**：只有 rejected version 能重新编辑；重提后状态回到 `pending`，避免把旧 reject reason 带到新提交。
5. **审核动作有治理记录**：版本状态变更会写 platform governance event，至少能支撑后续审计和运营面板。

仍不能被夸大的部分：

1. **审核状态不等于完整安全审核**：当前状态流能表达人工 moderation，但不能证明已经有 Raycast Store 式自动检查、依赖风险扫描、恶意代码审计或权限策略评分。
2. **开发者反馈仍偏薄**：拒绝原因可见，但缺固定结构的 reject checklist、risk summary、修复建议、重新提交差异对比和审核队列 SLA。
3. **Store trust summary 尚未合并审核证据**：版本 status、包完整性、sdkapi、权限风险、下载/评分、official/community 等信任信号还没有形成用户可见的统一 trust card。
4. **端到端 evidence 还需补样本**：主文档建议用 `touch-snippets` 跑一条 Manifest -> build -> publish dry-run -> package preview -> pending -> approve/reject -> Store 展示 -> first run 的闭环，这仍然必要。

因此，后续最小改进不应重写版本状态模型，而应把已有 moderation 状态、timeline、notification、package integrity、permission / sdkapi 摘要组合成可见的 review feedback / trust summary，并补一条真实插件的审核通过与拒绝样本。

## 是否发现需修正的主文档问题

否。未发现需要修改 `01-11` 主分析文档的问题。

主文档没有否认 Tuff 已有版本审核状态，也没有把它夸大成完整 Store review parity。当前源码核对支持 `08` 与 `11` 的口径：version moderation 有基础，缺口在产品化审核反馈、risk summary、review evidence 和 Store trust summary。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-69.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout。
