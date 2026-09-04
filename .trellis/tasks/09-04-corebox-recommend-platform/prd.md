# CoreBox 推荐层重构:来源注册表、Stream 传输统一与推荐 SDK 开放

> Parent task. 本文件持有需求源、任务地图和跨子任务验收标准,不含技术设计与执行清单。
> 各子任务自带 `prd.md` / `design.md` / `implement.md`。

## Goal

把 CoreBox 空态推荐从「硬编码 fan-out + 内置来源」改造成「可扩展来源注册表 + 对插件开放的 recommend SDK」,
并把资源协议(tfile / stream)的控制面统一进 transport SDK,使新索引的 App、文件(尤其图片)
和第三方插件推送的内容都能进入推荐池。

## 需求源(用户原始诉求,2026-09-04)

1. 空态上下两段重新标识:上段不再叫「常用」。
2. Provider SDK 开放度:此前只做了 App Provider 和 File Provider,其他 Provider 没有开放 SDK 权限。
3. IPC 信道升级为 Stream 形式;此前有一套 postMessage 握手升级协议,需要优化。
4. 原生 tfile 协议(系统层级协议捕获)与上述协议统一放进 transport message SDK。
5. 改完后推荐要能支持:新索引的 App、新索引的文件(尤其图片等资源)。
6. 插件开放 recommend SDK,第三方插件可推送内容(例:插件新打开了一个项目 → 进 recommend)。
7. 推荐缓存有时效,需结合其他数据提供给第三方插件;插件也可直接调用内置权重函数。
8. 第一层(搜索)接入的 Provider 偏多,需要分析并优化。

## 现状校正(勘察于 2026-09-04,与需求源的偏差)

以下三条是需求源的前提与代码现状不一致之处,设计必须基于校正后的事实:

- **需求 3 的前提不成立**:Stream 与 postMessage 握手升级**均已存在** ——
  `packages/utils/transport/sdk/stream/{protocol,client-runtime,server-runtime}.ts`、
  `packages/utils/transport/port-handoff.ts`、`packages/utils/transport/sdk/port-policy.ts`。
  更进一步:**空态推荐本身早已走在流上** —— `search-core.ts:1012` 的空 query 分支
  经 `search.session`(`stream: { enabled: true, bufferSize: 100 }`,且已在 port allowlist)
  以 `snapshot` chunk 下发,`TuffSearchResult.containerLayout` 携带分组信息。
  真实缺口是:推荐在具备流式能力的通道里**仍是一次性 `await` 快照**,
  从不发送已定义的 `{ type: 'update' }` chunk,因此插件推送与新索引条目
  无法追加到**已打开**的空态会话。
- **需求 2 的封闭点不在 Search Provider**:查询侧已注册 8 个 provider、索引侧 5 个 indexed source。
  真正写死的是推荐侧 `item-rebuilder.ts:104 rebuildItems()` —— 7 个分支的硬编码 fan-out
  加一张 `normalizeSourceId()` 硬编码别名表。新来源无法进入推荐池的机制原因在此。
  附:`rebuildItem(itemId)` **已是 3 个 provider 上的事实约定**
  (`main-window-provider.ts:160`、`windows-shell-file-provider.ts:323`、
  `system-actions-provider.ts:712`),但未声明在 `ISearchProvider` 上,靠鸭子类型调用 ——
  这是注册表改造的天然切口。
- **需求 1 的「常用」不是分组标题**:当前后端产出的是两个 grid section
  (`recommendation-engine.ts:1449`:`'Recommend'` + `'Pinned'`)。
  字符串 `'常用'` 是 **badge 文案**,硬编码于 `item-rebuilder.ts:653`。设计稿的分组标题在代码中尚不存在。
  且渲染端 `BoxGrid.vue:94-127` **完全忽略 `section.layout`**,每个 section 一律渲染成宫格 ——
  列表分支不存在(组件 `BoxItem.vue` 已有,缺的是分支)。
- **需求 5 与现有刻意设计冲突**:`search-core.ts:479-485` 的注释写明
  「the recommendation grid never contains files」,且只对 `APP_INDEXED_SOURCE_ID` 触发缓存失效,
  理由是 file commit 在索引构建期连续触发、会打穿 30 分钟缓存。
  因此**不能**简单把 file source 加进失效条件 —— 正确机制是增量追加,不是缓存失效。
- **需求 6/7 的根因是短路而非缺函数**:`recommendation-engine.ts:2243` 对插件候选
  直接 `return priority × PLUGIN_PRIORITY_WEIGHT`,**跳过整个评分函数** ——
  时间相关性、频率、最近使用、novelty、语义向量一概拿不到。
  不是「没给插件权重函数」,而是「给了也用不上,因为插件条目不进那条路径」。

补充勘察结论:

- `stream:` scheme **在代码中完全不存在**(既未 `registerSchemesAsPrivileged`,也无 handler)。
  `apps/core-app/src/main/index.ts:71` 只注册了 `tfile`。
- `atom:` scheme **已退役**,`service/protocol-handler.ts:9` 返回 410 墓碑响应。
- 因此 `.trellis/spec/frontend/native-resource-protocols.md` §"Three Electron schemes" 的
  `atom` 与 `stream` 两行**均已过时**,本任务需一并修正。
- `CoreBoxEvents.recommendation.get` 全仓仅有一个 main 侧注册(`search-core.ts:2122`),
  渲染端与插件**均无调用者**,是死信道(`aggregateTimeStats` / `isPinned` 待一并核查)。
  本仓有「刻意保留的死 IPC」先例,须先判定归属再决定是否删除。
- 推荐缓存 `CACHE_DURATION_MS = 30 * 60 * 1000`(内存 + DB 双层);index-commit 失效触发
  **只对 `APP_INDEXED_SOURCE_ID` 生效**(见 `recommendation-freshness-contracts.md` §Cache invalidation),
  这是「新索引文件/图片进不了推荐」的第二个阻塞点。
- 插件 `RecommendSDK` 类型与引擎侧 `registerPluginProvider`(`recommendation-engine.ts:1067`)已存在,
  但走 `PluginRecommendCandidate` 这条**不带 usageStats 的旁路**,因此插件拿不到内置权重函数。

## 已定决策(2026-09-04)

- **D1 — tfile/stream 边界**:统一控制面 **并** 启用 `stream:` scheme。
  控制面(descriptor 类型、URL 投影、allowlist 契约)收进 transport SDK;
  同时为 `stream:` 补一份正式 owner + URL 契约,承接 tfile 覆盖不到的动态生成流。
  资源字节**仍不得**经由 `transport/sdk/stream/protocol.ts` 传输。
- **D2 — 空态分段命名**:上段(宫格,⌘1–⌘6)= 「此刻常用」;下段(列表,⌘7–⌘0)= 「最近案例」。

## 约束

- `transport/sdk/stream/protocol.ts` 是 typed transport 协议,**不得携带 image/audio/video/file 字节**
  (`native-resource-protocols.md`:attachment 例外终止于 Electron main)。启用 `stream:` 不放宽此约束。
- `stream:` scheme 不得成为无契约的 blob 隧道;必须有明确 owner、URL 契约与 allowlist,
  并与 tfile 共用同一套路径规范化与授权边界,不得新建第二套 path policy。
- 推荐来源注册表不得绕过既有的 Settings diagnostics、权限与降级路径。
- `recommendation.source` 联合类型跨三个文件(`core-box/recommendation.ts`、
  `core-box/tuff/tuff-dsl.ts`、`transport/events/types/core-box.ts`),扩展时必须三处同改。
- `installedAt` 写一次不刷新;`files.ctime` 保持 insert-only。新鲜度判定为双闸门。
- 插件侧不得 import `@talex-touch/tuff-native/protocol` 或任何 raw carrier。

## 任务地图

| 子任务 | 交付物 | 独立验收 |
|---|---|---|
| C1 推荐来源注册表 | 以注册表替换 `item-rebuilder` 硬编码 fan-out 与 `normalizeSourceId` 别名表 | 新来源无需改 item-rebuilder 即可进推荐池 |
| C2 传输与资源协议统一 | 空态会话支持增量追加(复用既有 `update` chunk);tfile 控制面收进 transport SDK;`stream:` scheme 建立或放弃;死信道判定 | 已打开的空态会话可追加条目;`stream:` 有带证据的结论 |
| C3 推荐 SDK 与权重开放 | 插件 recommend 走主通道并可调用内置权重函数;缓存时效与上下文数据对插件可见 | 插件推送项与内置项同池排序,权重函数有公开签名与测试 |
| C4 空态两段 UI 与文案收敛 | 宫格+列表两段 layout;badge/标题文案收敛并接 i18n | 空态渲染符合设计稿;文案不再散落于三个文件 |

另有一项**分析交付**(不改代码,归入 C1 的 research):第一层 Provider 收敛分析 —— 文件搜索
5 个 provider 的「快路径 vs 索引路径」职责混装,以及内置 `system-actions-provider` 与
`plugins/touch-system-actions` 的疑似重复(**尚未实测确认**)。

## 跨子任务验收标准

- [ ] 新索引的 App 与新索引的文件(含图片)都能在缓存 TTL 内进入推荐,且不需要修改 `item-rebuilder`。
- [ ] 第三方插件推送的条目(例:插件打开的项目)与内置条目进入同一排序池,而非旁路。
- [ ] 插件可调用内置权重函数;函数有公开签名、文档与测试,不暴露 usageStats 原始数据。
- [ ] 已打开的空态会话可增量追加条目(插件推送、新索引 App/文件),无需重新唤起 CoreBox。
- [ ] 索引构建期不产生推荐缓存失效风暴:`invalidateCache()` 调用次数不随文件数增长。
- [ ] `tfile` 与 `stream:` 共用同一套路径规范化与 allowlist;资源字节未经 transport stream protocol。
- [ ] 空态渲染为「此刻常用」宫格 + 「最近案例」列表两段,文案走 i18n。
- [ ] `native-resource-protocols.md` 的 `atom`/`stream` 描述已修正为代码现状。
- [ ] `recommendation.source` 若有扩展,三个文件同步。
- [ ] `pnpm lint`、`typecheck`、`pnpm utils:test` 全绿。

## 开放问题

- **Q1**:「最近案例」作为下段标题与内容存在语义偏差 —— 设计稿下段含
  「剪贴板历史 · 插件」「截图 OCR · 插件 · 动作」等条目,它们并非「最近」发生的对象。
  标题已按用户原文记录,**待复核**是否改为更贴合的措辞。
- **Q2**:`stream:` scheme 的具体承接场景尚未界定(哪些资源是 tfile 覆盖不到、必须动态流式生成的)。
  若最终无实际消费者,C2 中该部分应当砍掉而非空转注册一个 scheme。
  **这是对用户已作决策的潜在修订** —— 用户在「以为 scheme 已注册」的信息下选择了启用,
  实测发现是从零建立。门禁结论须回报用户确认。
- **Q3**:内置 `system-actions-provider` 与 `plugins/touch-system-actions` 是否真重复,需实测确认。
- **Q4**:开放给插件的「内置权重函数」边界 —— 仅暴露纯函数
  (`calculateTimeContextBoost` / `calculateHourAffinity` / `calculateTimeRelevanceScore`),
  还是连同 frecency 主评分一并暴露?后者会把排序策略变成公开 API,影响后续调参自由度。
  **C3 的 design 建议只暴露时间类纯函数,需用户拍板。**
- **Q5**:插件条目 usageStats 回流是否需要用户可见的隐私说明(C3)。
- **Q6**:新索引文件进推荐的准入规则归属 —— 宿主写死 / 用户设置 / 插件声明(C3)。
- **Q7**:空态 Pinned 段的去向 —— 合并进上段 / 保留为第三段 / 移除(C4)。
  设计稿无 Pinned 段,但移除属行为删除,需确认。
- **Q8**:两段条目数固定(6 + 5)还是自适应(C4)。
