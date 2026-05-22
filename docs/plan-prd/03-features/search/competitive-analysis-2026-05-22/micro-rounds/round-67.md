# 微审计 67/70

- 审计主题

uTools 超级面板的“按输入类型匹配动作”是否已经能映射到 Tuff 当前 `TuffQuery.inputs`、`acceptedInputTypes` 与插件搜索过滤链。重点不是复刻桌面鼠标面板，而是核对 Tuff 是否已有 text / image / files / html 输入类型基础，以及主分析文档把缺口定位为 `ContextActionProvider` / 用户可见 evidence 是否准确。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
   - 第 1 节结论明确：Tuff 已有 Manifest / Prelude / Surface、`sdkapi`、权限模型、`acceptedInputTypes` 与 `TuffQuery.inputs`，当前缺口不是复制 uTools 超级面板，而是统一 `ContextActionProvider` 合同。
   - 第 2.1 节把 uTools `plugin.json` / `cmds` / `regex` / `over` / `img` / `files` / `window` 映射到 Tuff Manifest、`commands`、`acceptedInputTypes` 与 `TuffQuery.inputs`，并强调 active window 只能后置弱信号。
   - 第 6 节把超级面板最小合同限定为 selected text、clipboard image、files 三类输入，并要求输出 action id、pluginName / featureId、input source、permission、capability status / reason 与 execute result。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
   - 第 1 节指出 uTools 的优势是输入类型匹配；Tuff 当前散点包括 `TuffQuery`、`acceptedInputTypes`、snippets、browser open、translation、OmniPanel 与 Flow payload。
   - 第 3 节证据对照把 `TuffQuery.text` / `inputs`、`IPluginFeature.acceptedInputTypes`、`plugin-features-adapter.ts` 输入过滤、`touch-translation` 文本/图片输入等作为 live-tree 事实。
   - 第 4 节要求变量来源区分 `query.text`、`query.inputs.text/image/files/html`、`selection.text`、`clipboard.text`、`item.meta` 等，并记录 permission、inputSource、support level、resolved / blocked / invalid 结果。
3. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffInputType` 明确定义 `text`、`image`、`files`、`html` 四类输入。
   - `TuffQueryInput` 定义 `type`、`content`、`rawContent`、`thumbnail`、`metadata`，其中 files 是 JSON 序列化路径数组，html 可保留 raw HTML。
   - `TuffQuery` 明确区分 `text` 是用户主动输入，`inputs` 是剪贴板或其他来源的附加输入。
4. `packages/utils/plugin/index.ts`
   - `IPluginFeature.acceptedInputTypes` 可声明 `text` / `image` / `files` / `html`；未声明时默认向后兼容为 text-only。
   - `onFeatureTriggered` 的 data 可为字符串或完整 `TuffQuery`，并可携带 clipboard image / files / HTML inputs。
5. `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
   - 搜索时读取 `query.inputs` 得到 input types，并把 text / html 当成 text-like。
   - 当存在非 text 输入时，未声明 `acceptedInputTypes` 的 feature 会被跳过；声明但不接受所有当前 input types 的 feature 也会被跳过。
   - 命中条件包括 command match、clipboard text command match 或 feature accepts input；输入命中会用 `matchSource` 标记为 `input`。
6. `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
   - 搜索 parse 阶段会解析 clipboard inputs，构建 cache key 时保留 inputs 维度。
   - provider 聚合阶段遇到非 text 输入时，会过滤掉不支持对应 `supportedInputTypes` 的 provider，但保留 `plugin-features` 继续做插件级输入匹配。
7. `plugins/touch-intelligence/manifest.json`、`plugins/touch-translation/manifest.json`
   - `touch-intelligence` 的 `intelligence-ask` 声明 `acceptedInputTypes: ["text", "image"]`，可作为 clipboard image / AI 问答的当前样本。
   - `touch-translation` 的文本翻译 features 当前声明 `acceptedInputTypes: ["text"]`，说明普通文本翻译和图片翻译/截图翻译不应被混作同一个通用输入动作。

- 结论

主文档口径成立：Tuff 已有承接 uTools 超级面板“输入类型匹配”的底层数据结构和搜索过滤链，但还没有产品层统一的 Context Actions evidence。

已经真实存在的能力：

1. **输入类型 DSL 存在**：`TuffInputType` 与 `TuffQueryInput` 覆盖 text、image、files、html，且区分主动输入 `text` 和附加输入 `inputs`。
2. **插件声明面存在**：`acceptedInputTypes` 能表达 feature 可处理的输入类型，`onFeatureTriggered` 可接收完整 `TuffQuery`。
3. **搜索过滤链存在**：非 text inputs 会先过滤 provider，再进入插件 feature 级匹配；插件 feature 只在声明接受输入类型时才会被召回。
4. **具体插件样本存在**：`touch-intelligence` 已是 text + image 输入样本；`touch-translation` 文本 feature 保持 text-only，避免图片输入误召回普通文本动作。

仍未完成的能力：

1. **缺用户可见 input source**：当前 `matchSource: "input"` 过粗，不能区分 selected text、clipboard image、clipboard files、typed query 或 clipboard HTML。
2. **缺 capability reason 汇总**：插件能否执行、缺什么权限、provider 是否 degraded、当前平台是否 unsupported，还没有在同一 action 列表里统一展示。
3. **缺 ContextActionProvider 合同**：CoreBox / MetaOverlay / Assistant 可以复用入口，但还没有稳定 action id、inputSource、permission、capability.status、execute result 的统一 contract。
4. **缺 evidence 样本**：需要用 selected text、clipboard image、files 三个样本跑出动作列表、过滤原因和执行结果，证明不是隐式剪贴板读取或空结果伪成功。

因此后续最小动作应继续沿用主文档建议：做 `context-actions-v1` 薄合同，首批只覆盖 selected text、clipboard image、files；不做桌面鼠标超级面板，不绕开 Manifest / `sdkapi` / permission hard-cut，不把 active window 作为默认授权输入。

- 是否发现需修正的主文档问题

否。`04-utools-plugin-cross-platform.md` 与 `06-parameter-filling-dynamic-variables.md` 对该点的判断与 live source 一致：Tuff 底层输入类型、插件声明和搜索过滤链已经存在；缺口是统一 Context Actions 产品合同、input source、capability reason 与 evidence 样本。没有发现需要修改 01-11 主分析文档的问题。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-67.md`，并更新 `.codexpotter` 进度记录。未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
