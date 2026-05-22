# 微审计 37/70

- 审计主题：uTools `plugin.json` 与 Tuff Manifest 的映射是否完整；重点核对 `features` / `cmds` / 输入数据源 / 权限 / 平台 / AI Agent tools 这些声明面，避免把 Tuff 当前 manifest 能力夸大成已经完整覆盖 uTools 动态工具注册。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
    - 第 1 节把 uTools 拆成“入口 + 数据源匹配 + 插件市场”，并说明 Tuff 当前是 Manifest / Prelude / Surface 三层、`sdkapi` hard-cut、权限模型、`acceptedInputTypes` 与 `TuffQuery.inputs`。
    - 第 2 节映射 `plugin.json`、功能指令、匹配指令、动态指令和 AI Agent tools：Tuff 可吸收稳定 id、权限、schema、审计事件，但不允许 manifest-only tool 伪装成可调用工具。
    - 第 4 节把搜索关键字触发映射到 Manifest `features[].commands` / `keywords` / CoreBox provider，把文本、图片、文件输入映射到 `acceptedInputTypes` 与 `TuffQuery.inputs`。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/08-plugin-store-sdk-ecosystem.md`
    - 第 2.3 节把 uTools `plugin.json` 对照到 Tuff `category`、`features[].commands`、`acceptedInputTypes`、`permissionReasons`。
    - 第 3 节证据表把 Manifest / Prelude / Surface、`sdkapi` hard-cut、权限 capability、CLI validate、`.tpex` package preview 和 package integrity 分开描述，没有把完整性校验写成“安全无风险”。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 37 条结论是：uTools `plugin.json` 与 Tuff manifest 映射清楚，Tuff 额外有 `sdkapi` hard-cut；本轮针对该判断做源码复核。
  - `packages/utils/plugin/index.ts`
    - `IManifest` 声明 `id`、`name`、`version`、`sdkapi`、`category`、`description`、`author`、`main`、`platforms`、`features`、`permissions`、`permissionReasons` 等字段；这能覆盖 uTools `plugin.json` 的插件元信息、入口、功能列表、平台和权限解释。
    - `IPluginFeature` 声明 `id`、`name`、`desc`、`icon`、`keywords`、`push`、`platform`、`commands`、`interaction`、`priority`、`acceptedInputTypes`、`omniTransfer`；其中 `acceptedInputTypes` 只枚举 `text`、`image`、`files`、`html`，和文档里的输入合同一致。
    - `ITouchPlugin` 暴露 `addFeature`、`delFeature`、`getFeature`、`triggerFeature`、`triggerInputChanged`，说明有运行期 feature 管理底座；但这仍不是 uTools `tools` / AI Agent tool registry 的稳定公开合同。
  - `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
    - `PluginFeaturesAdapter.supportedInputTypes` 明确支持 `Text`、`Image`、`Files`、`Html`。
    - `isCommandMatch()` 支持 `over`、`match`、`contain`、`regex` 四类 command 匹配；这能承接 uTools `cmds` 的搜索触发心智，但不是 uTools 所有对象型数据源匹配的逐字段复制。
    - 执行路径会通过 `plugin.triggerFeature(feature, query)` 触发 Prelude handler；push / webcontent feature 还能激活 provider 或加载插件视图。
  - `packages/utils/plugin/sdk-version.ts`
    - `CURRENT_SDK_VERSION` 为 `260428`，`SUPPORTED_SDK_VERSIONS` 是 canonical allowlist；缺失、非法、低于基线或非 supported marker 会被阻断。这说明 Tuff manifest 比 uTools `plugin.json` 多一层运行时硬门禁。
  - `plugins/touch-browser-open/manifest.json`、`plugins/touch-translation/manifest.json`、`plugins/touch-intelligence/manifest.json`
    - 三个官方插件均声明 `sdkapi: 260428`、`category`、`main`、`permissions`、`permissionReasons` 和 `features`。
    - `touch-browser-open` 展示了 URL / 网页搜索类 `commands` 与 `acceptedInputTypes: ["text"]`。
    - `touch-translation` 展示了文本翻译、多源翻译和截图翻译；截图翻译声明 `acceptedInputTypes: ["text", "image"]`，和文档对 OCR / 图片输入的边界一致。
    - `touch-intelligence` 展示了 AI 问答 feature 与 `acceptedInputTypes: ["text", "image"]`，但 manifest 中没有 `tools` 字段。
  - 额外只读搜索：
    - 在 `plugins`、`packages/utils/plugin/index.ts`、`apps/nexus/content/docs/dev/reference/manifest.zh.mdc` 中搜索 `"tools"`、`"workflows"`、`"workflow"`、`"agentTools"` 字段声明，未发现可作为当前 Tuff manifest 合同的稳定字段。

- 结论：
  - 主文档把 uTools `plugin.json` 映射到 Tuff Manifest 是成立的：插件元信息、入口文件、功能列表、搜索命令、平台声明、权限声明、权限理由和输入类型都能在 `IManifest` / `IPluginFeature` 与官方插件 manifest 中找到真实锚点。
  - Tuff 不是简单复制 uTools：`sdkapi` hard-cut、canonical allowlist、`permissionReasons`、`acceptedInputTypes` 和 typed `TuffQuery` 让 manifest 更偏可审计生态，而不是低门槛但弱边界的声明文件。
  - `cmds` 的映射应理解为“命令触发与输入类型触发的核心心智”，不是逐字段等价。当前 `PluginFeaturesAdapter` 已支持 command match / contain / regex 和 text/image/files/html 输入过滤，但 uTools 对象型数据源、动态增减功能、AI Agent tools 仍需要后续合同补齐。
  - AI Agent tools 是最容易被误读的点：`04` 已经写清楚 uTools `plugin.json.tools` 还需要运行期 `registerTool`，Tuff 也不应把 manifest-only tool 当作可调用能力。源码侧目前没有 `tools` / `agentTools` / workflow tool manifest 字段，因此只能说“映射方向完整”，不能说“AI Agent tool manifest 已落地”。
  - 因此第 37 条台账判断是准确的：Tuff manifest 对 uTools `plugin.json` 的主要插件声明面映射清楚，并且安全边界更强；剩余差距应收敛到 Context Actions、动态 feature 管理可见性、AI tool registry schema 与 Store/CLI evidence，而不是修正文档主结论。

- 是否发现需修正的主文档问题：否。`04`、`08`、`11` 没有把 uTools `tools` 或动态能力写成 Tuff 已完成能力，也没有放松 `sdkapi` / 权限 / 审计边界；它们把相关能力归为后续合同和 evidence，和源码现状一致。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-37.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
