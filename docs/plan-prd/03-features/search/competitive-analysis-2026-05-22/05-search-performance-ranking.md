# 搜索、排序与性能体验专项

> 日期：2026-05-22
> 范围：Raycast / Alfred / uTools 的搜索速度、召回、排序、最近/常用、文件搜索、App Launcher、动作面板与键盘导航体验；对照 Tuff 当前 CoreBox 搜索实现。
> 约束：不建议一口气重写搜索引擎；只建议可插拔 trace、样本验证与小口径排序改进。

## 1. 结论

Tuff 当前搜索系统已经有相当多的工程基础：`SearchEngineCore` 有 `search-trace/v1`、first result / session end 事件、provider summary 与 Nexus telemetry；`gatherAggregator` 有 fast / deferred 分层、provider duration/status/resultCount；`tuffSorter` 有 match/frequency/recency/kind/pinned/app alias 评分；`RecommendationEngine` 有 frequent/recent/time-based/trending/context/pinned 候选；Everything / FileProvider / Native providers 也已有一部分 backend diagnostics、path filtering、FTS 和 provider fallback。

真正的差距不是“没有搜索引擎”，而是缺少可读、可复核、可发版声明的体验证据：

1. **速度证据不完整**：已有 first.result / session.end 和 provider timing，但还没有按 app/file/preview/plugin 场景沉淀 P50/P95、fallback ratio、degraded reason 的 release evidence pack。
2. **排序解释不够可见**：`tuffSorter` 公式存在，但用户、调试者和验收文档看不到“为什么这个结果排第一”。Raycast / Alfred 都把 alias、frecency/knowledge、reset ranking 或 keyword latching 做成用户可理解的模型。
3. **文件搜索边界更复杂**：Raycast 官方 File Search 只按文件/文件夹名匹配，不索引文件内容；Tuff FileProvider 同时有 precise keyword、prefix、FTS、内容索引与 Everything/Spotlight/native fast layer，因此更强但更容易引入噪音、隐私、性能和“为什么搜到它”的解释风险。
4. **动作面板与上下文动作已具雏形但未统一成 evidence**：Tuff `MetaOverlay`、built-in actions、item actions、插件 feature activation、clipboard/file inputs 都存在，但还缺 Raycast Action Panel / Alfred Universal Actions / uTools 超级面板那种“当前 item 或当前输入能做什么”的可验收样本。
5. **键盘导航基本可用，但 section/page/category 级导航需要证据**：Tuff list/grid/section grid 支持上下左右、数字快速聚焦、`Cmd/Ctrl+K` 动作面板；竞品强调 section jump、page jump、文件分类切换、动作菜单等。Tuff 不一定要复制，但需要证明常用路径不打断键盘流。

本专项建议的最小方向：保留现有 SearchEngineCore / provider / sorter 架构，把 `search-trace/v1` 延伸成“搜索证据包”和“top results ranking explain”，再用 20-50 条固定样本验证 app/file/plugin/preview/empty-query 的 P50/P95、召回与降级原因。不要重写搜索引擎。

## 2. 竞品体验模式

### 2.1 Raycast

Raycast 的 Search Bar 是所有能力的入口，会实时搜索系统与扩展。它把 Root Search 排序解释为 alias、title fuzzy、subtitle/keyword 和 frecency 的组合，并提供 Reset Ranking。Raycast 还明确把 Favorites、Aliases、File Search、Calculator、Quicklinks、Snippets、AI Commands 等放入同一个 Root Search 心智。

关键体验特征：

| 维度 | 体验特征 | 对 Tuff 的启发 |
| --- | --- | --- |
| 搜索速度 | 输入后实时返回；Compact Mode 空查询可折叠，输入后展开 | Tuff 已有 30ms renderer debounce、80ms fast layer timeout；需要证明 first result P50/P95 |
| 召回 | Root Search 覆盖 app、commands、indexed files、calendar、contacts、calculator、quicklinks、snippets、AI commands 等 | Tuff provider 也多，但需要 source diagnostics 说明每个来源是否 ready/degraded |
| 排序 | exact alias > alias prefix > title fuzzy > subtitle/keyword > frecency | Tuff `tuffSorter` 已有 app alias/title intent bonus、match/frequency/recency/pinned；缺 ranking explain |
| 最近/常用 | frecency 学习同一 query 下用户选择；Favorites 空查询置顶 | Tuff UsageStats / pinned / RecommendationEngine 能承接；缺 query-level latching evidence |
| 文件搜索 | 文件/文件夹直接进 Root Search；Search Files 有详情面板；官方说明匹配文件名，不索引文件内容 | Tuff FileProvider 更激进，必须暴露 search source、content/FTS reason 与噪音边界 |
| App Launcher | 支持 fuzzy，`msg` 找 Messages、`slk` 找 Slack；Favorites 置顶 | Tuff AppProvider 有 fuzzy、initials、pinyin、alternateNames；需要跨平台样本 |
| 动作面板 | 每个 Root Search item 都有 Action Panel；`Cmd/Ctrl+K` 可搜索 actions、设置 alias/hotkey、reset ranking | Tuff MetaOverlay 已有 `Cmd/Ctrl+K`，应补 item actions searchable evidence |
| 键盘导航 | 上下移动、section/page jump、Enter primary、`Cmd/Ctrl+K` actions | Tuff 需证明 list/grid/section grid 对齐主路径 |

### 2.2 Alfred

Alfred 的 Default Results 默认包含 Applications、Contacts、Preferences，可按 file type 和 search scope 配置。结果排序有 4 周 rolling knowledge 与 keyword latching：同一输入短语会学习用户选择，避免高频 app 永远压过当前意图。文件排序还依赖 macOS metadata 的 Last Used / Last Modified。

关键体验特征：

| 维度 | 体验特征 | 对 Tuff 的启发 |
| --- | --- | --- |
| 搜索速度 | 默认结果范围受 file type / search scope 控制，避免所有东西都进首屏 | Tuff 需要 provider/category filter 与 fast/deferred 分层证据，避免过宽 provider 拖慢首屏 |
| 召回 | 默认结果保守；通过 `open` / `find` 等关键词扩展文件搜索 | Tuff `@file` / provider filter 已存在，应文档化并验收 |
| 排序 | rolling knowledge + keyword latching；同一 query 与选择绑定 | Tuff 已有 UsageStats 与 QueryCompletionService，但应补“query -> chosen item”样本 |
| 最近/常用 | 4 周滚动知识；可清除 Knowledge | Tuff usage stats 有 execute/search/cancel 和时间衰减；缺 reset/解释入口 |
| 文件搜索 | `open`/`find`/`in` 与 File Filters；默认文件排序依赖 Last Used / Last Modified | Tuff FileProvider 有 lastModified，但 `lastUsedScore` / file frequency 目前为 0，需要先用 trace 证明是否影响排序 |
| 动作面板 | Universal Actions 可对文本、URL、文件触发相关动作；Actions panel 可从 Alfred 内外进入 | Tuff 的 clipboard/files/html inputs 与 MetaOverlay 可作为最小 Context Actions V1 |
| 键盘导航 | 结果内可用 right arrow 打开 actions；File Buffer 支持多文件动作 | Tuff 暂不需要 File Buffer，但文件 action menu 要有键盘证据 |

### 2.3 uTools

uTools 强调 `Alt+Space` 输入框、一切皆插件、即用即走。输入框可输入文本、粘贴图片、截图、文件或文件夹，然后自动展示可处理这些内容的插件。超级面板则按选中文本、图片、文件、文件夹等数据源智能匹配功能选项。本地搜索插件提供文件类型分类、Tab/Shift+Tab 切换分类、上下选择文件、右方向键/右键打开文件菜单。

关键体验特征：

| 维度 | 体验特征 | 对 Tuff 的启发 |
| --- | --- | --- |
| 搜索速度 | 入口轻，完成后自动回到工作流 | Tuff background app launch immediate-hide 已接近该体验，需要首屏/执行后隐藏 evidence |
| 召回 | 插件功能指令 + 智能匹配；文本/图片/文件路径/截图会触发不同插件 | Tuff `acceptedInputTypes` 和 clipboard query inputs 已有基础，应补 source-level match reason |
| 排序 | 公开文档更强调功能指令、固定/禁用、最近使用，不强调公式 | Tuff 不需暴露复杂公式给用户，但调试 trace 必须能解释 |
| 最近/常用 | 最近使用可显示/隐藏；指令可固定/禁用 | Tuff pinned/recommendation 已有；缺用户可见的推荐来源说明和验收样本 |
| 文件搜索 | 本地搜索有分类、文件菜单、当前资源管理器窗口内搜索、文件夹内搜索、文件选择框搜索 | Tuff FileProvider/Everything 强在 backend，但缺“限定当前目录/分类切换”的产品证据 |
| 动作面板 | 超级面板按数据源推荐动作 | Tuff 最小不要做鼠标面板重写，先做 selected text / clipboard image / file path 的 ContextAction trace |
| 键盘导航 | 搜索项上下左右、Tab 分类、Ctrl+Tab 展开、Esc 返回/清空 | Tuff 已有多态 Escape、grid/list arrows；缺 category/page-level 快捷键对照 |

## 3. Tuff 当前代码证据

| 组件 | 代码证据 | 当前事实 | 缺口判断 |
| --- | --- | --- | --- |
| SearchEngineCore | `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 注册 app/system/file/plugin/preview providers；生成 `search-trace/v1`；记录 parse/providerSelect/mergeRank/total；缓存 5s；记录 first.result 和 session.end；Nexus telemetry 包含 provider timings/status/error/timeout、resultCategories、searchScene | 已有 trace 基础；缺 provider.degraded reason、ranking explain 与固定样本 evidence 消费面 |
| providers | `registerDefaults()` 与 `aggregateProvidersForQuery()` | Windows: shell + Everything + FileProvider；macOS: Spotlight + FileProvider；Linux: native + FileProvider；PluginFeatures 与 Preview 也进入统一链路 | provider 选择已有；缺各平台 provider ready/degraded 的 release sample |
| gatherAggregator | `search-gather.ts` | fast layer timeout 80ms、deferred delay 50ms、fast concurrency 3、deferred concurrency 2、task timeout 3000ms；sourceStats 记录 providerId/name/duration/resultCount/status/layer | 已支持首屏快返；缺“first result 是否来自 fast layer、late fast 是否造成重排”的样本 |
| tuffSorter | `sort/tuff-sorter.ts` | matchScore 主导，frequency/recency 行为学习，kindBias 软偏置，pinned 置顶，app title/alias intent bonus，大幅压制低置信 feature recall 的历史频次 | 公式清楚但不可解释；建议导出 topN explain，不改排序主公式 |
| UsageStats | `usage-utils.ts`、`usage-stats-cache.ts`、`usage-stats-queue.ts` | execute/search/cancel 参与频率，时间衰减；缓存 15 分钟；top 10 search results 异步记录 search，execute 后记录 execute 与趋势 | 行为学习存在；缺 query-level latching 与 reset/debug surface |
| RecommendationEngine | `recommendation/recommendation-engine.ts` | 空查询用 context、frequent、recent、time-based、trending、plugin、clipboard URL、pinned；有 memory/db cache、perf telemetry、grid sections | 推荐基础强；缺推荐来源、cache layer、degraded reason 在 UI/evidence 中统一展示 |
| PreviewProvider | `addon/preview/preview-provider.ts` | `calc` / `calculator` / `calculate` / `计算` / `换算` 显式前缀；priority fast；结果复制并写 preview history | Calculator 路径可用；缺 explicit/non-explicit 命中率和 first result 样本 |
| EverythingProvider | `addon/files/everything-provider.ts`、`everything-diagnostics.ts` | Windows fast provider；backend `sdk-napi -> cli -> unavailable`；diagnostics stage/duration/error；path filtering 走 FileProvider watch roots；真实 backend 故障同次 fallback 到 FileProvider | 后端诊断丰富；缺普通 search trace 里把 backend/pathFiltering/fallback reason 透出 |
| FileProvider | `addon/files/file-provider.ts` | deferred provider；precise keyword、phrase、prefix、FTS、type/ext filter；scoring 含 keyword/fts/lastModified/semantic；后台索引、worker、progress、startup degraded notice | 能力比竞品文件名搜索更宽；缺 lastUsed/frequency 接入，缺 content/FTS 噪音证据 |
| Native file providers | `addon/files/native-file-search-provider.ts` | macOS Spotlight / Linux locate-tracker-baloo fast provider；结果按 position + recency 评分；macOS 限默认路径与 extra paths，排除 `.app` bundle 内部 | 快速召回合理；缺 native provider unavailable reason 消费面 |
| renderer search | `useSearch.ts` | 30ms search debounce、25ms input broadcast debounce、200ms duplicate query window、400ms recommendation timeout；sessionId 防 stale update | 前端抗闪烁/去重存在；缺 UI-level first-paint 与 queued update evidence |
| list/grid | `BoxGrid.vue`、`BoxGridItem.vue` | recommendation/pinned sections、quick key `Cmd+1..0`、grid columns/gap/itemSize | 推荐 grid 可用；普通搜索仍以 list 为主，缺 section jump/page jump 证据 |
| keyboard hook | `useKeyboard.ts` | Enter execute，ArrowUp/Down list/grid，ArrowLeft/Right grid，`Cmd/Ctrl+K` MetaOverlay，数字聚焦，Esc 顺序清理 clipboard/provider/query/window | 键盘路径完整；缺 action panel 搜索/文件菜单/section jump 对照 |

## 4. 搜索体验差距矩阵

| 体验面 | 竞品行为 | Tuff 当前代码证据 | 风险 | 性能/体验指标 | 最小验证样本 |
| --- | --- | --- | --- | --- | --- |
| First result latency | Raycast/uTools 都强调输入即结果；Alfred 通过默认范围控制结果集合 | `useSearch` 30ms debounce；`gatherAggregator` fast layer 80ms；`SearchEngineCore` first.result trace | fast layer 为空或 provider blocked 时首屏慢/空，但 trace 不直观 | first.result P50/P95、firstCount、fast layer timeout ratio、empty-first ratio | 20 条 app/preview/plugin 查询；Windows/macOS 各跑 5 轮，输出 paired first.result/session.end |
| Provider duration | Raycast/Alfred 用户不关心 provider，但体验要求来源不能拖慢整体 | sourceStats 记录 provider duration/status/layer；Nexus telemetry 有 providerTimings/status | provider degraded 只在日志/设置里局部可见，CoreBox evidence 不统一 | provider P50/P95、timeout/error count、blockedUntil、resultCount | `@app code`、`@file invoice`、`calc 2+2`、插件指令各记录 provider sourceStats |
| 结果召回 | Raycast Root Search 覆盖 app/command/file/calculator/quicklinks；uTools 文本/图片/文件智能匹配 | AppProvider/FileProvider/Everything/PluginFeatures/Preview/clipboard inputs | provider 覆盖宽，但用户无法判断某来源未就绪还是无结果 | source ready/degraded reason、no-result source summary、inputTypes | 空查询、文本查询、clipboard image、file path、unknown query 各记录 source diagnostics |
| App Launcher 排序 | Raycast alias/fuzzy/favorites；Alfred apps 默认包含且支持 initials/fuzzy；uTools 可按名称/拼音首字母找软件 | App search processing 支持 name/fuzzy/initials/pinyin/alternate-name/path/description；tuffSorter 有 app intent bonus | hidden token 或插件 feature 可能挤掉 app；localized/alias 样本不足 | top1 是否 app、matchSource、appAliasBonus、execute after same query reorder | `code`、`gc`、`wx`、中文 app 拼音首字母、localized app 各 5 次 |
| 文件搜索召回 | Raycast 文件名搜索且不索引内容；Alfred 用 metadata 和 `open/find/in` 扩展；uTools 本地搜索支持分类/目录内搜索 | Everything fast、Spotlight/Linux native fast、FileProvider deferred FTS/content | Tuff 更宽，可能产生“内容命中但标题不相关”的噪音；Everything path filtering 不可见 | filename-hit/content-hit/fts-hit ratio、outside-root dropped、stale candidate count、file first.result P95 | Windows Everything SDK/CLI/unavailable；macOS Spotlight；FileProvider `@file pdf`、`ext:md`、短前缀查询 |
| 最近/常用 | Raycast frecency；Alfred 4 周 rolling knowledge + keyword latching；uTools 最近使用/固定/禁用 | UsageStats execute/search/cancel/time decay；RecommendationEngine frequent/recent/time-based/trending/pinned | 有全局行为学习，但缺 query-level “我选过这个结果”解释；cancel 惩罚不可见 | top1 after repeated execute、query-specific selection accuracy、cancel penalty effect | 同一 query 选择 A 3 次后 top1 是否稳定；取消高频误召回后是否下降 |
| Empty query 推荐 | Raycast Favorites/最近文件；uTools 最近使用；Alfred 默认知识 | RecommendationEngine context/frequent/recent/time/trending/plugin/clipboard URL/pinned + grid sections | memory/db cache 可能让推荐 stale；推荐来源 badge 不全 | recommendation duration P50/P95、cacheLayer、source distribution、pinned position | 空查询 20 次；切换 foreground app / clipboard URL / pinned 后验证列表变化 |
| Action Panel | Raycast 每个 item 都有 searchable Action Panel；Alfred Universal Actions；uTools 超级面板按数据源匹配 | MetaOverlay `Cmd/Ctrl+K`、built-in actions、item.actions、file reveal、pin/copy/title、plugin actions | action 是否存在、能否执行、是否需权限没有统一 diagnostics；文件 action menu 不如竞品明显 | action count、primary action latency、action failure reason、shortcut coverage | app/file/plugin/preview/image item 各打开 MetaOverlay，记录 action 列表与 primary/secondary execute |
| 键盘导航 | Raycast 上下/section/page/Action Panel；Alfred right arrow actions；uTools 上下左右、Tab 分类、Ctrl+Tab 展开 | `useKeyboard` 支持 list/grid arrows、数字聚焦、Esc 状态机、MetaOverlay、grid sections | 无 section/page/category jump evidence；grid section wrap 行为需验收 | focus move correctness、scroll visibility、execute selected consistency、Esc step correctness | list 15 项、grid 12 项、multi-section recommendation、file result action panel 各跑键盘脚本 |
| 降级/失败诚实度 | 竞品设置/权限/索引状态会影响结果，但核心体验不应伪成功 | Everything fallback、FileProvider startup degraded notice、provider health refractory | 普通搜索结果里不一定能看到 degraded reason；Everything fallback 到 FileProvider 后来源可能不明显 | degraded reason coverage、fallback ratio、unavailable source count | Everything disabled/unavailable、FileProvider warming、native provider missing、plugin provider timeout |

## 5. 最小 search trace / evidence 方案

### 5.1 设计原则

1. **不记录 query 明文**：沿用 `toQueryHash()` 与 query length；ranking explain 只记录 titleHash/itemId/source/kind 与数值 bucket。
2. **不阻塞搜索路径**：trace 使用现有 logger / telemetry / best-effort 写入；provider 诊断在 provider 内聚合，CoreBox 只消费摘要。
3. **先 topN explain，不全量 explain**：只对 top 5 或 top 10 输出排序解释，避免大结果集开销。
4. **先 evidence pack，不做 UI 大改**：先生成可验证 JSON/日志摘要，再决定是否在设置页或 CoreBox footer 展示。
5. **先指标门槛观察，再设 release gate**：样本不足时只标记 `enoughSamples=false`，不把 P95 误当发布事实。

### 5.2 Trace 事件最小字段

| 事件 | 触发点 | 字段 |
| --- | --- | --- |
| `ipc.query.received` | renderer query 进入 main | sessionId、queryHash、queryLen、inputTypes、providerFilter、activatedProvidersCount |
| `provider.done` | 每个 provider 完成 | providerId、layer、durationMs、status、resultCount、degradedReason、backend、fallbackUsed |
| `first.result` | 首批结果 resolve 前 | totalMs、firstCount、provider summary、mergeRankMs、topN ranking explain |
| `search.update` | deferred / late fast update | updateMs、newCount、providerId/layer、causedReorder |
| `session.end` | 所有 provider 完成 | totalMs、totalCount、provider P95 candidate、failure/degraded summary |
| `item.execute` | 用户执行 | executeLatencyMs、selectedIndex、sourceId、itemKind、rankingReasonSummary、queryHash |
| `item.cancel` | 用户关闭或跳过 top result | selectedIndex 或 topItemIdHash、reason bucket |

### 5.3 Source diagnostics 最小合同

```ts
interface SearchSourceDiagnostic {
  providerId: string
  providerName: string
  category: 'app' | 'file' | 'plugin' | 'preview' | 'system' | 'other'
  layer: 'fast' | 'deferred'
  status: 'success' | 'timeout' | 'error' | 'aborted' | 'degraded' | 'skipped'
  durationMs: number
  resultCount: number
  ready?: boolean
  degradedReason?: string
  backend?: string
  fallbackUsed?: boolean
  fallbackTarget?: string
  pathFiltering?: {
    rawCount?: number
    filteredCount?: number
    droppedCount?: number
    reason?: string | null
  }
}
```

映射当前实现：

- Everything：复用 `backend`、`fallbackChain`、`EverythingDiagnosticsTracker`、`pathFilteringStatus`。
- FileProvider：补 `startup-warming`、`index-worker-unavailable`、`fts-empty`、`stale-candidates-removed`、`type-filter-empty` 等 reason。
- Native providers：补 `backend-unavailable`、`platform-mismatch`、`timeout`。
- PluginFeatures：补 pluginName、featureId、permission/capability blocked reason。
- PreviewProvider：补 abilityId、confidence、explicitCommand。

### 5.4 Ranking explain 最小合同

```ts
interface RankingExplain {
  itemIdHash: string
  sourceId: string
  kind: string
  rank: number
  finalScoreBucket: string
  reasonLabels: string[]
  components: {
    pinned?: boolean
    matchScore?: number
    matchSource?: string
    frequencyScore?: number
    recencyScore?: number
    kindBias?: number
    appTitleIntentBonus?: number
    appAliasIntentBonus?: number
    providerBaseScore?: number
    fileKeywordHit?: boolean
    fileFtsScore?: number
    fileSemanticScore?: number
  }
}
```

最小实现不要改排序公式，只把 `calculateSortScore()` 内部组件拆成 `calculateSortScoreWithExplain()`，`tuffSorter` 继续用原公式。FileProvider / Everything / PreviewProvider 已经写入部分 `scoring` 和 `meta.extension.search`，可以先透出 provider base reason；后续再统一。

### 5.5 P50/P95 汇总口径

| 指标 | 口径 | 首批建议门槛 |
| --- | --- | --- |
| first.result P50/P95 | `first.result.totalMs`，按 scene 分组 | app/preview P95 先观察是否 <= 250ms；file fast P95 先观察是否 <= 500ms |
| session.end P50/P95 | `session.end.totalMs` | deferred/file 场景先观察是否 <= 1200ms |
| provider duration P95 | provider.done duration，按 providerId 分组 | fast provider P95 明显高于 80ms 时标记 |
| fast layer timeout ratio | fast provider 未在 80ms 内完成的 session 比例 | > 10% 标记风险，不直接失败 |
| fallback/degraded ratio | fallbackUsed 或 status degraded 的 session 比例 | > 5% 需要 source reason |
| top1 execute rate | top result 被执行次数 / session 数 | 用于排序改进，不作为硬门槛 |
| top1 cancel/skip rate | top result 被跳过或 Escape 的比例 | 高于样本中位数时进入 ranking review |

### 5.6 固定样本包

| 样本组 | 查询 | 覆盖 |
| --- | --- | --- |
| App Launcher | `code`、`gc`、`wx`、中文 app 拼音首字母、localized app 名称 | app fuzzy、alias、alternateNames、pinyin、localized displayName |
| File Search | `@file invoice`、`@file screenshot`、`ext:md project`、短前缀 `wind`、当前 watch root 外文件名 | Everything/FileProvider/native、path filtering、prefix/FTS |
| Preview | `calc 2+2`、`计算 1m to cm`、`#ff6600`、`100 usd to cny` | PreviewProvider fast、abilityId、confidence、history |
| Plugin command | `翻译`、`snippet`、`json`、`ocr`、`bookmark` | plugin feature recall、acceptedInputTypes、action panel |
| Context input | clipboard text URL、clipboard image、file path input、HTML input | uTools/Alfred 对标的智能匹配 |
| Empty query | no clipboard、clipboard URL、pinned app、recent app、foreground app changed | RecommendationEngine context/cache/pinned/recent |
| Failure/degraded | Everything disabled、CLI path invalid、FileProvider warming、plugin timeout、native provider missing | fallback/degraded reason |

## 6. 小口径改进建议

只建议这些小切片，不建议重写：

1. **新增 `ranking explain` helper**：从 `tuffSorter` 公式拆出 explain 结构，默认只记录 top 5；不改排序权重。
2. **把 source diagnostics 收束到 search trace**：Everything / FileProvider / native / plugin / preview 各输出最小 `SearchSourceDiagnostic` 摘要；先写日志/telemetry，不做 UI 大面板。
3. **补固定样本 verifier**：新增脚本读取 `search-trace/v1` 日志，复用 `search-trace-stats.ts` 汇总 P50/P95，并按 scene 输出 evidence JSON。
4. **补 query-level learning 样本**：利用现有 `QueryCompletionService` / UsageStats，验证同一 query 下连续执行同一 item 后 top1 是否稳定；先做 evidence，不急着改公式。
5. **FileProvider 只做解释优先**：先把 keyword/FTS/content/semantic hit reason 写入 explain；不要直接扩大内容索引或改权重。
6. **动作面板 evidence**：围绕 `MetaOverlay` 跑 app/file/plugin/preview/image 五类 item，记录 action count、primary action、failure reason；不做 uTools 式鼠标超级面板重写。
7. **键盘路径 smoke**：list/grid/section grid/MetaOverlay/Escape 五条路径用 Playwright 或 renderer unit 固化；优先证明不打断键盘流。

## 7. 不做事项

- 不重写 `SearchEngineCore`、provider 注册、gatherAggregator 或 sorter。
- 不把所有文件内容搜索默认推到首屏；FileProvider 的内容/FTS 命中先用 reason 和样本证明可控。
- 不复制 Raycast/Alfred/uTools 的全部快捷键；只对齐 Tuff 现有 list/grid/action panel 的主路径。
- 不把 AI rerank 作为搜索排序 MVP；AI embedding/rerank 在 RecommendationEngine 已是可选增强，失败应 fail-open。
- 不记录 query 明文、剪贴板明文或文件内容到 trace/evidence。

## 8. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只做搜索性能排序专项，不改代码 | 通过 | 输出限定到本文件 |
| 2 | 基线 review：读取既有 capability gap 与 App Data roadmap | 通过 | 延续“证据与统一模型不足，不是基础能力缺失”的口径 |
| 3 | 竞品事实 enforce：优先官方来源 | 通过 | 只引用 Raycast Manual、Alfred Help、uTools 帮助中心/官网 |
| 4 | Raycast review：搜索排序是否准确 | 通过 | 补 alias、fuzzy、frecency、Favorites、File Search 文件名边界与 Action Panel |
| 5 | Alfred review：是否覆盖排序学习 | 通过 | 补 4 周 rolling knowledge、keyword latching、Last Used/Last Modified、Universal Actions |
| 6 | uTools review：是否覆盖输入与超级面板 | 通过 | 补文本/图片/截图/文件输入智能匹配、本地搜索快捷键和超级面板多数据源 |
| 7 | Tuff 源码 enforce：必须覆盖指定模块 | 通过 | 逐项对照 SearchEngineCore、providers、gatherAggregator、tuffSorter、RecommendationEngine、UsageStats、PreviewProvider、Everything/FileProvider、BoxGrid/grid/list、keyboard hook |
| 8 | 缺口矩阵 review：必须包含风险、指标、样本 | 通过 | 第 4 节增加风险、性能/体验指标和最小验证样本 |
| 9 | 方案 enforce：不得建议重写搜索引擎 | 通过 | 第 6/7 节限定为 trace、evidence、ranking explain、小口径验证 |
| 10 | 完整性 review：必须包含 trace/evidence 方案 | 通过 | 第 5 节覆盖 first result latency、provider duration、source diagnostics、ranking explain、P50/P95、failure/degraded reason |

## 9. 引用来源

来源复核时间：2026-05-22。以下均为官方页面；本文不引用第三方性能断言。

### Raycast

- Raycast Manual - Search Bar: https://manual.raycast.com/search-bar
- Raycast Manual - Action Panel: https://manual.raycast.com/action-panel
- Raycast Manual - File Search: https://manual.raycast.com/file-search
- Raycast Manual - Calculator: https://manual.raycast.com/calculator
- Raycast Windows: https://www.raycast.com/windows

### Alfred

- Alfred Help - Default Results: https://www.alfredapp.com/help/features/default-results/
- Alfred Help - Understanding Result Ordering: https://www.alfredapp.com/help/kb/understanding-result-ordering/
- Alfred Help - File Search: https://www.alfredapp.com/help/features/file-search/
- Alfred Help - Universal Actions: https://www.alfredapp.com/help/features/universal-actions/

### uTools

- uTools 输入框，一切的入口: https://www.u-tools.cn/docs/guide/uTools-search-bar.html
- uTools 功能指令详解: https://www.u-tools.cn/docs/guide/what-is-keyword.html
- uTools 超级面板: https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 本地搜索: https://www.u-tools.cn/docs/guide/plugin-local-search.html
- uTools 快捷键: https://www.u-tools.cn/docs/guide/shortcut.html
