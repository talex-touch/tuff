# 微审计 40/70

- 审计主题：uTools 动态功能 `utools.setFeature` / `removeFeature` 映射到 Tuff 时，当前运行时是否已经具备动态注册插件 feature 的真实底座，以及主文档把它定位为“有底座但缺用户可见动态管理合同”是否准确。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
    - 第 2.1 节把 uTools 动态指令拆成 `utools.setFeature` / `removeFeature`，Tuff 映射方向是 Prelude 运行期注册能力，但必须附带 `pluginName`、`featureId`、source evidence，并且不能绕过 Manifest 权限、`sdkapi` 或 category 校验。
    - 第 3 节强调 Tuff 当前强项是 Manifest / Prelude / Surface、`sdkapi` hard-cut、权限 reason 与 `acceptedInputTypes`，缺口是统一 Context Actions 产品合同，而不是复制 uTools 超级面板 UI。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
    - `context-actions-v1` 切片要求动作输出带 inputSource、permission/status/reason 与执行结果，说明动态功能不能只停留在运行时增删列表，还要可解释、可审计。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 40 条已给出预期边界：Tuff feature 可由 Prelude 注册，但缺 `utools.setFeature` 等价的用户可见动态管理合同；文档没有把当前能力夸大成完整等价。
  - `packages/utils/plugin/index.ts`
    - `IPluginFeature` 仍是稳定 feature 合同，包含 `id`、`name`、`desc`、`commands`、`acceptedInputTypes`、`priority`、`interaction` 等字段。
    - `ITouchPlugin` 暴露 `addFeature(feature)`、`delFeature(featureId)`、`getFeature(featureId)`、`getFeatures()`，说明动态 feature 管理不是纯文档设想。
  - `packages/utils/plugin/sdk/features.ts` 与 `packages/utils/plugin/sdk/types.ts`
    - `IFeaturesManager` / `createFeaturesManager()` 对插件侧暴露 `addFeature()`、`removeFeature()`、`getFeatures()`、`getFeature()`、`setPriority()`、`getFeaturesByPriority()`。
    - SDK 注释把这组 API 定义为“动态添加功能到插件”和“完整的 features 管理功能”，是 Tuff 对 uTools 动态功能的直接技术底座。
  - `apps/core-app/src/main/modules/plugin/plugin.ts`
    - `addFeature()` 会校验 feature id 为 `^[\w-]+$`、`commands.length >= 1`、名称/描述不包含禁用词，并把普通定义包装成 `PluginFeature` 后加入当前插件实例。
    - `createPluginAPI()` 暴露 `featuresManager`，Prelude 中的插件代码可调用 `features.addFeature()` / `features.removeFeature()`。
    - 需要注意：`delFeature(featureId)` 当前按 `feature.name === featureId` 查找，而 SDK 文档参数名是 `featureId`；这说明 remove 语义还需要后续合同和测试收紧，不能把当前实现描述成完整 `removeFeature` parity。
  - `apps/core-app/src/main/modules/plugin/plugin-feature.ts`
    - 动态传入的 plain feature 会被包装成 `PluginFeature`，并在 `toJSONObject()` 中序列化 `commands`、`priority`、`experimental`、`acceptedInputTypes`、`omniTransfer` 等字段。
  - `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
    - 搜索阶段每次遍历 `plugin.getFeatures()`，因此运行时新增的 feature 能被 CoreBox 重新消费。
    - `createTuffItem()` 会把 `pluginName`、`featureId`、`commands`、`searchTokens`、`acceptedInputTypes` 写入 item meta，满足动态功能进入搜索与执行路径的基础可观测性。
    - 当 query 携带 non-text input 时，adapter 会要求 feature 声明并覆盖 `acceptedInputTypes`，动态 feature 不能天然绕过输入类型过滤。
  - `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
    - Manifest 静态 features 也经由 `touchPlugin.addFeature()` 加入插件实例；若 `sdkapi` 被阻断则直接跳过 feature 加载。
    - loader 仍负责 Manifest 层的 `sdkapi`、category、permission、commands 结构等校验，动态 feature 只能发生在插件已通过加载门禁之后。
  - `plugins/touch-browser-open/index.js`
    - `registerSearchEngineFeatures()` 在 `onInit()` 中根据搜索引擎设置调用 `features.addFeature(feature)`，动态注册 `search-engine:*` 功能，是当前动态 feature 的真实样本。
  - `plugins/touch-quick-actions/index.js`
    - `registerDynamicFeatures()` 在 `onInit()` 中根据平台动作列表调用 `features.addFeature(feature)`，并在执行前走 shell capability、权限与二次确认守卫，是“动态功能 + 风险边界”的更贴近 uTools 动态指令样本。

- 结论：
  - 主文档的边界判断成立。Tuff 当前确实有运行时动态 feature 底座：插件 Prelude 能通过 SDK 暴露的 `features.addFeature()` 注册新功能，CoreBox 搜索适配器会从 `plugin.getFeatures()` 读取最新列表，动态 feature 能带着 `pluginName` / `featureId` / `acceptedInputTypes` / `commands` 进入搜索、排序和执行路径。
  - 这已经不是“只能在 manifest.json 静态声明”的状态。`touch-browser-open` 的搜索引擎动态 feature 与 `touch-quick-actions` 的平台动作动态 feature 都证明该路径在官方插件中被使用。
  - 但它仍不能等价为完整 uTools `setFeature` / `removeFeature` 产品能力。原因有四点：
    1. **缺用户可见管理合同**：当前动态 feature 多在 `onInit()` 内部注册，用户看不到动态来源、启用条件、配置来源、最近变更或禁用入口。
    2. **缺动态注册审计事件**：搜索 item 有 `pluginName` / `featureId`，但还没有统一记录“由哪个插件、基于什么设置、何时新增/移除 feature”的 run summary 或 Store evidence。
    3. **权限边界依赖插件自守**：插件必须已通过 Manifest / `sdkapi` / permission 门禁，动态 feature 本身不能新增权限；执行期仍需要像 `touch-quick-actions` 那样把 capability/status/reason 写清楚，否则容易出现“动态入口存在但执行时才失败”的体验。
    4. **remove 语义还不够稳**：SDK 文档说 `removeFeature(featureId)`，但当前主进程删除实现按 `name` 匹配；这不影响 `addFeature` 底座成立，却说明动态管理合同还没到可宣传为 uTools parity 的程度。
  - 因此后续最小路径不是另起一套动态插件系统，而是在现有 `features.addFeature()` 上补三件事：动态 feature 来源 evidence、动态注册/移除审计日志、以及 `removeFeature(featureId)` 语义与测试收紧。Context Actions v1 可复用这条动态 feature 底座，但必须额外补 inputSource、permission/status/reason 和 execute result。

- 是否发现需修正的主文档问题：否。`04`、`10`、`11` 没有把当前 Tuff 写成完整 uTools 动态功能等价实现；它们把动态 feature 作为 Prelude/runtime 底座，并把用户可见合同、权限 reason、Context Actions 与 evidence 放在后续阶段，和源码一致。本轮只补充一个实现层注意点：`removeFeature(featureId)` 的主进程匹配语义应在后续开发时收紧，但这不要求修改 `01-11` 主分析文档。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-40.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
