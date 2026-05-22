# 微审计 62/70

- 审计主题

Nexus Store / Raycast Store / Alfred Gallery / uTools 插件市场的“能力卡与信任摘要”映射是否准确；重点核对 Tuff 当前是否已经把插件 manifest 里的 `acceptedInputTypes`、平台限制、权限、`sdkapi` 和审核状态展示成用户可见的 Store capability chips / trust summary，还是仍主要停留在后端 manifest 数据和基础 Store 卡片。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
   - 第 3 节把 Manifest / Prelude / Surface、权限与 capability、`.tpex` package preview、审核状态、Store 发现拆成不同能力面。
   - 第 4 节差距矩阵明确 Store 卡片当前需要补“输入类型、平台、权限、capability health”。
   - 第 5.2 节要求 Store detail 至少展示 Header、Trust summary、Capabilities、Versions、Content packs、Install / Update readiness。
   - 第 7 节把 `Store trust summary` 和 `Review queue UX` 放在 P1，不宣称当前已经完整落地。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
   - `nexus-plugin-workflow-card-v1` 要求 Store card 展示 triggers / inputTypes / permissions / setup required / last validated。
   - `CA-P1-005` 把 Nexus plugin/workflow capability card 定义为后续任务，并要求 `.tpex` dry-run + Store card visible evidence。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 65 条确认 Nexus version moderation 有 pending / approved / rejected 基础，但缺 review evidence 和 capability card。
   - 第 150 行 P1 建议要求 Manifest、permissions、`sdkapi`、package integrity、publish dry-run、Store card、安装失败 reason 全可见。
4. `packages/utils/plugin/index.ts`
   - `IPluginFeature.acceptedInputTypes` 明确只支持 `text`、`image`、`files`、`html`，并说明未声明时默认 text。
   - `ITouchPlugin` 有 `category`、`features`、`sdkapi`、`declaredPermissions` 等 manifest 级字段，可作为 Store capability card 的数据源。
5. `apps/nexus/server/api/store/plugins.get.ts`
   - compact Store 列表响应只返回 `id`、`slug`、`name`、`summary`、`category`、`installs`、`homepage`、`isOfficial`、`badges`、`author`、`iconUrl`、`createdAt`、`updatedAt`、`latestVersion` 和 `readmeUrl`。
   - compact 模式下的 `latestVersion` 不返回 `manifest`，因此公开 Store 列表卡片没有直接拿到 input types / permissions / platforms / `sdkapi`。
6. `apps/nexus/server/api/store/plugins/[slug].get.ts`
   - 详情接口的 `cleanVersionForStore()` 会返回 `manifest: version.manifest`、`status`、`signature`、`packageSize`、`readmeMarkdown` 等字段。
   - 这说明 manifest 元数据在后端详情层可用，但仍需要前端显式解析和展示。
7. `apps/nexus/app/types/store.ts`
   - `StorePluginVersion` 当前类型只声明 `id`、`channel`、`version`、`createdAt`、`signature`、`packageUrl`、`packageSize`、`changelog`、`readmeMarkdown`，没有声明 `manifest`、`status`、`sdkapi`、`permissions` 或 `acceptedInputTypes`。
   - `StorePluginSummary` 也只有 `badges` 与基础元数据，没有 capability chips 字段。
8. `apps/nexus/app/components/store/StoreItem.vue`
   - 公开 Store 卡片展示分类、更新时间、版本、channel、安装数和 `badges`。
   - 卡片没有展示输入类型、平台矩阵、权限风险、`sdkapi`、完整性状态或审核状态。
9. `apps/nexus/app/pages/store.vue`
   - Store 列表使用 `/api/store/plugins?compact=1`，因此默认列表路径本来就拿不到完整 manifest。
   - 详情页把 `selectedPlugin` 转成 `SharedPluginDetail` 时只传 `badges`、`installs`、`official`、`latestVersion`、`versions` 和 README，没有从 `latestVersion.manifest` 生成 `metaItems` 或 capability chips。
10. `packages/utils/renderer/shared/plugin-detail.ts` 与 `SharedPluginDetailMetaList.vue`
    - 共享详情模型已经有 `metaItems` 扩展槽位，可以展示 label / value / icon / highlight。
    - 当前 Store 页未使用这个槽位承接 manifest capability 信息。

- 结论

主文档对该映射点的判断成立：Tuff 有足够的 manifest 数据和 Store 后端基础，但还不能宣称已经具备 Raycast Store / Alfred Gallery / uTools 插件市场那种“用户一眼看懂插件能处理什么、需要什么权限、在哪些平台可用、是否可信”的完整能力卡。

已经成立的事实：

1. 插件 manifest 层确实能表达 `features[].acceptedInputTypes`、`features[].platform`、`permissions.required/optional`、`permissionReasons`、`category`、`sdkapi` 等信息。
2. Nexus 详情接口会把 version `manifest` 返回给 Store detail，因此后端不是完全缺数据。
3. Store 列表/详情 UI 已经有基础展示：分类、版本、channel、安装数、官方 badge、README、versions、content packages、reviews。
4. `SharedPluginDetail` 已经预留 `metaItems`，理论上可低成本承接 capability / trust summary，不需要重做 Store 详情框架。

但当前产品面仍有明确缺口：

1. Store 列表走 compact 接口，卡片拿不到 manifest，自然无法展示 input type / permission / platform chips。
2. Store detail 虽然后端返回 manifest，但前端类型没有声明这些字段，`sharedDetail` 也没有解析 manifest 生成能力摘要。
3. 当前 `badges` 只是通用标签，不等价于可审计的 trust summary；用户无法区分完整性校验、审核状态、权限风险和官方身份。
4. `latestVersion.status` 虽由详情接口返回，但前端类型和 UI 主路径没有把 pending / approved / rejected 作为 Store detail 的信任信息展示。
5. 没有从 `permissionReasons` 生成风险解释，也没有把 `acceptedInputTypes` 与 Context Actions / 多输入能力显式关联给用户看。

因此最小下一步应继续沿主文档方向推进 `nexus-plugin-workflow-card-v1`，但范围要保持小：先在 Store detail 中从 latest approved version manifest 生成只读 `metaItems` / chips，覆盖 `sdkapi`、input types、platforms、required permissions、optional permissions、package integrity、version status；列表页只放 2-3 个高信号 chip，不把完整 manifest 原样展开，也不把 `_files` / `_signature` 写成“安全无风险”。

- 是否发现需修正的主文档问题

否。`08`、`10`、`11` 没有把当前 Nexus Store 夸大为完整 capability card / trust summary；它们准确地把 Store 展示、风险摘要、审核 evidence 和 capability chips 放在 P1。源码核对反而支持这个判断：manifest 数据在后端详情层存在，但公开 UI 尚未把它产品化。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-62.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
