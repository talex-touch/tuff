# 微审计 38/70

- 审计主题：uTools `cmds` 数据源匹配是否能真实映射到 Tuff 的 `acceptedInputTypes`，重点核对非文本输入（image/files/html）进入 CoreBox 后，插件 feature 是否会被正确过滤和展示，而不是只靠文本 command 命中或把所有插件都暴露出来。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
    - 第 1 节明确 Tuff 已有 `acceptedInputTypes` 与 `TuffQuery.inputs` 承载 text / image / files / html，缺口是统一 `ContextActionProvider`，不是复制 uTools 超级面板。
    - 第 2 节把 uTools 功能指令拆成搜索框指令、数据源匹配、动态指令和 AI Agent tools；其中数据源匹配建议由 `acceptedInputTypes + TuffQuery.inputs` 承接。
    - 第 4 节将图片、文件/文件夹、超级面板分别映射到 Tuff 的图片输入、files 输入、CoreBox/MetaOverlay Context Actions，并强调写入类动作需权限和二次确认。
    - 第 6 节把 v1 输入限定为 selected text、clipboard image、files，后置 clipboard-html、active-app、screenshot-region，符合最小合同思路。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 38 条给出本轮判断点：uTools `cmds` 数据源匹配可映射到 `acceptedInputTypes`；`PluginFeaturesAdapter` 对 non-text input 会按 `acceptedInputTypes` 过滤。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`
    - `TuffInputType` 只定义 `text`、`image`、`files`、`html` 四类查询输入。
    - `TuffQueryInput.content` 按类型承载文本、image data URL、JSON 序列化文件路径数组或 HTML，另有 `rawContent`、`thumbnail`、`metadata`。
    - `TuffQuery` 明确区分 `text`（用户主动输入）和 `inputs`（剪贴板或其他附加输入），为数据源匹配提供独立结构。
  - `packages/utils/plugin/index.ts`
    - `IFeatureCommand.type` 包含 `match`、`contain`、`regex`、`function`、`over`、`image`、`files`、`directory`、`window` 等枚举。
    - 但 `IPluginFeature.acceptedInputTypes?: Array<'text' | 'image' | 'files' | 'html'>` 才是当前明确声明 feature 可处理输入类型的字段。
    - `onFeatureTriggered()` payload 可以是 string 或完整 `TuffQuery`，说明 feature 执行阶段能够接收附加输入。
  - `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
    - provider 自身声明支持 `Text`、`Image`、`Files`、`Html`。
    - 搜索时先读取 `query.inputs` 的类型；`Text` 和 `Html` 被视为 text-like，image/files 属于 non-text input。
    - 只要存在 non-text input，未声明 `acceptedInputTypes` 的 feature 会被跳过；声明了但未覆盖所有输入类型的 feature 也会被跳过。
    - 展示 feature 的条件包括 command 命中、clipboard text command 命中，或 feature 接受当前输入类型；后者的 match source 会标为 `input`。
    - `createTuffItem()` 会把 `acceptedInputTypes` 写入 item meta，给前端 UI 决策留下数据。
  - `apps/core-app/src/main/modules/box-tool/search-engine/utils/resolve-clipboard-inputs.ts`
    - 执行前会把 `TuffInputType.Files` 且缺 `content`、带 `metadata.clipboardId` 的输入解析回真实剪贴板文件内容。
    - 这说明 files 输入不是只在搜索阶段做文案展示，执行阶段也有恢复文件 payload 的路径。

- 结论：
  - 主文档第 38 条判断成立：Tuff 当前已有足够的底层机制，把 uTools `cmds` 里的图片、文件、HTML 等数据源匹配映射到 `TuffQuery.inputs + acceptedInputTypes`。
  - 关键证据不是 `IFeatureCommand.type` 里出现了 `image/files/window` 枚举，而是 `PluginFeaturesAdapter` 对 non-text input 的实际过滤逻辑：没有声明 `acceptedInputTypes` 的 feature 不会被展示，声明不完整的 feature 也不会被展示。这能避免 clipboard image 或 files 上下文误触发 text-only 插件。
  - 当前实现也支持“无文本命令但输入类型匹配”的展示路径：当 feature 接受当前 input types 时，可以以 `matchSource = input` 进入结果列表，这正是 uTools 超级面板心智里“按数据源推荐动作”的最小等价物。
  - 但这仍不是完整 uTools `cmds` parity。Tuff 目前只把输入类型匹配落到 feature 搜索和执行 payload，还没有一等的 `ContextActionProvider` 输出合同、input source 字段、permission state、capability reason、action failure reason、selected-text 采集边界或 window 数据源合同。
  - 因此 P0/P1 方向应保持主文档方案：复用现有 `TuffQuery.inputs` 与 `acceptedInputTypes`，先做 selected text / clipboard image / files 的 Context Actions v1；不要另起一套 uTools 式 `cmds` 解释器，也不要把 `window` command type 误写成已具备跨平台窗口上下文匹配能力。

- 是否发现需修正的主文档问题：否。`04`、`10`、`11` 都把现状表述为“有输入合同和 adapter 过滤基础，但缺统一 Context Actions 产品合同 / evidence”，没有宣称 Tuff 已完整复刻 uTools 超级面板或全部 `cmds` 数据源能力。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-38.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
