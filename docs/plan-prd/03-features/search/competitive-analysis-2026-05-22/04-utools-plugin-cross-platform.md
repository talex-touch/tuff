# uTools 插件机制与跨平台专项

> 日期：2026-05-22
> 范围：uTools 插件机制、超级面板、功能指令、插件市场、开发者体验与跨平台能力，对照 Tuff Manifest / Prelude / Surface、sdkapi、权限模型、TuffQuery、CoreBox、Nexus Store、tuff-cli、CloudShare。
> 约束：只输出竞品分析与最小下一步；不建议重做桌面鼠标超级面板；优先 selected text / clipboard image / files 的 Context Actions 小闭环。

## 1. 结论

uTools 的强项不是单一搜索框，而是“入口 + 数据源匹配 + 插件市场”的组合：用户可以通过搜索框输入功能指令，也可以通过超级面板把选中文本、图片、文件、文件夹等上下文交给插件；开发者通过 `plugin.json` 声明 `features`、`cmds`、入口文件与平台范围，配合 `preload` 和 API 完成功能；市场承担发现、安装、更新与分发。2026 年官方首页与开发者文档还把 uTools 明确推向“人与 AI Agent 共用的工具平台”：插件能力可通过 `plugin.json.tools` 暴露给 AI Agent，但仍要求运行时代码完成注册，这一点对 Tuff 的 AI-native 插件路线有直接参考价值。

Tuff 当前插件底座更工程化：Manifest / Prelude / Surface 三层清晰，`sdkapi` 已 hard-cut 到 canonical allowlist，权限模型可解释，`acceptedInputTypes` 与 `TuffQuery.inputs` 已能承载 text / image / files / html，Nexus SDK 文档已有从 Manifest 到 `.tpex` 发布的任务流，CloudShare 已区分公开内容包与用户私有同步。当前缺口不是“复制 uTools 超级面板”，而是缺一个统一的 `ContextActionProvider` 合同，把已有输入类型、权限 reason、插件匹配结果和 CoreBox/MetaOverlay 入口串成用户可理解的上下文动作列表。

最小建议：

1. P0：补 `context-actions-v1`，只覆盖 selected text、clipboard image、files 三类输入；输出 item 必须带 input source、permission state、unsupported/degraded reason。
2. P0：跨平台能力统一 fail-closed 口径，特别是系统动作、窗口管理、截图/OCR、浏览器数据、文件搜索 provider，不允许静默空结果伪装成功。
3. P1：把 Nexus Store / tuff-cli 的插件任务流改造成“像 uTools 一样容易上手，但比 uTools 更可审计”：manifest validate、sdkapi 阻断、权限理由、dry-run publish、内容包边界一起展示。
4. P1：将超级面板映射为 Tuff Context Actions，不做长按鼠标右键桌面面板，不抢当前 CoreBox / MetaOverlay 主线。

## 2. uTools 机制拆解

| 机制 | uTools 行为 | 对用户的价值 | 对开发者的含义 | Tuff 对照 |
| --- | --- | --- | --- | --- |
| 万能搜索框 | 通过全局快捷键呼出，输入关键字或自然文本触发插件 | 低摩擦启动、搜索、计算、翻译、打开应用 | 插件需要声明可匹配的功能指令 | CoreBox + `features[].commands` / `keywords` / provider 排序 |
| 功能指令 | 文本、关键字、文件路径、截图等会触发不同插件推荐 | 用户不必记住完整命令 | `cmds` / 动态指令决定命中逻辑 | Manifest `features[].commands`、`acceptedInputTypes`、Prelude `onFeatureTriggered` |
| 超级面板 | 对选中文本、图片、文件、文件夹智能匹配可用动作 | 上下文动作不需要先复制再搜索 | 插件要声明能处理的数据类型 | Tuff 应收敛为 `ContextActionProvider`，先接 selected text / clipboard image / files |
| 插件应用市场 | 插件安装、更新、发现和生态入口 | 用户用市场补能力 | 开发者围绕插件包发布 | Nexus Store、`.tpex`、publisher、review、CloudShare 内容包 |
| 开发体验 | `plugin.json` + preload/API + 调试/发布 | 门槛低，适合小工具快速增长 | 声明式入口 + JS 能力面 | Tuff Manifest / Prelude / Surface 更严格，tuff-cli 支持 validate/build/publish |
| 跨平台 | Windows/macOS/Linux 都覆盖，但具体插件能力受 OS 限制 | 同一入口下获得尽可能一致体验 | 插件需处理平台差异 | Tuff 已有 `platform`、permission、capability reason，但缺统一汇总 UI/evidence |

uTools 对 Tuff 最值得借鉴的是“匹配链路的产品心智”，而不是 UI 形态。Tuff 已经有更强的权限、sdkapi 和 typed SDK 基础，应避免为了追随超级面板而绕回隐式剪贴板读取、raw channel 或鼠标事件型大改。

### 2.1 匹配链路细化

uTools 插件机制可以拆成五个可复用概念：

| 概念 | uTools 事实 | Tuff 应吸收的点 | Tuff 不应照搬的点 |
| --- | --- | --- | --- |
| 插件声明 | `plugin.json` 声明 `main`、`logo`、`preload`、`features`；每个 feature 有 `code`、`explain`、`cmds` | 保持 Manifest 作为唯一声明入口；`featureId` 必须稳定且进入 search trace | 不把 UI HTML 入口作为必需路径；Tuff 新插件仍以 Prelude 为首选 |
| 功能指令 | `cmds` 字符串用于搜索框直接启动；中文指令支持拼音/首字母搜索 | Tuff `commands` / `keywords` 应保证可读、短、可去重，并暴露 matched command | 不允许无意义宽泛关键词污染 CoreBox 排序 |
| 匹配指令 | `cmds` 对象支持 `regex`、`over`、`img`、`files`、`window` 等数据源匹配 | Tuff 用 `acceptedInputTypes` + `TuffQuery.inputs` 承接 text/image/files/html，并把 window/active-app 作为后置信号 | 不把 active window 作为默认自动授权能力；跨平台不可用时必须 `unsupported` |
| 动态指令 | `utools.setFeature` / `removeFeature` 支持插件运行后新增或移除功能 | Tuff 可在 Prelude 中动态 push CoreBox items，但必须附 pluginName/featureId/source evidence | 不允许动态能力绕过 Manifest 权限、`sdkapi` 或 category 校验 |
| AI Agent 工具 | `plugin.json.tools` 可声明工具，运行期需通过 `utools.registerTool` 完成真实注册 | Tuff 可把插件能力映射到 Intelligence / Workflow tool registry，但要复用 Manifest、权限、`sdkapi` 与审计事件 | 不允许“只在 manifest 声明”就对 Agent 可调用；也不把插件工具绕过用户权限和执行确认 |
| 发布审核 | 开发者工具发布到市场，需要插件信息、版本信息、截图、规范检查和审核结果 | Nexus Store / tuff-cli 应输出 manifest 摘要、权限摘要、平台矩阵、dry-run evidence | 不做“上传即上架”；`.tpex`、权限理由与内容包边界必须可审计 |

这意味着 Tuff 的最小合同应先定义“输入来源、匹配证据、能力状态、执行结果”，再决定 UI 放在 CoreBox、MetaOverlay 还是 Assistant。UI 入口可以复用多个，合同不能分裂。

补充一条 AI-only 边界：uTools 允许 `plugin.json` 中的 AI 工具不绑定 `features`，但仍必须由运行时代码 `registerTool` 后才可用。Tuff 可以借鉴“无 UI 工具”形态，但不能把它解释成“无 Manifest 能力”：即使首版没有 Surface，也必须有 stable tool id、权限理由、`sdkapi` 校验、schema 校验、调用审计、执行确认和失败 reason。

## 3. Tuff 当前对应能力

| Tuff 能力 | 当前事实 | 代码/文档证据 | 判断 |
| --- | --- | --- | --- |
| Manifest / Prelude / Surface | 新插件推荐 `main: "index.js"`；Manifest 声明能力，Prelude 轻量注册/调度，Surface 仅按需加载 | `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc`、`apps/nexus/content/docs/dev/reference/manifest.zh.mdc` | 架构清晰，适合承接 uTools 插件开发心智 |
| `sdkapi` hard-cut | 当前 marker 为 `260428`；未声明、非法、低于下限、非 canonical 或 future marker 都阻断 | `packages/utils/plugin/sdk-version.ts`、`apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts` | 比 uTools 更适合做可审计生态，不应放松 |
| 权限模型 | `fs.read/write/execute`、`clipboard.read/write`、`system.shell`、`network.internet`、`window.capture` 等按风险解释 | `apps/nexus/content/docs/dev/reference/manifest.zh.mdc`、`apps/nexus/content/docs/dev/api/permission.zh.mdc` | 可支撑 fail-closed 与 reason 展示 |
| 输入合同 | `acceptedInputTypes` 支持 `text`、`image`、`files`、`html`；`TuffQuery` 可携带 inputs | `packages/utils/plugin/index.ts`、`apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts` | 有数据结构，缺统一 Context Actions 产品合同 |
| 剪贴板输入 | 当前查询输入优先级为 image、file mode、clipboard files、长文本/HTML | `useClipboardState.ts` | 已能承载超级面板的输入子集 |
| 插件触发 | `onFeatureTriggered` 接收字符串或 `TuffQuery`，支持 AbortSignal | `packages/utils/plugin/index.ts` | 可直接承接上下文触发 |
| 插件发布 | 文档要求 `tuff validate --strict`、`tuff build`、`tuff publish --dry-run`，再 `tuff publish` | `plugin-workflow.zh.mdc`、`docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md` | 基线可用，缺端到端 evidence 与市场可见性 |
| 内容包 | CloudShare 用于公开/团队内容包，CloudSync 用于用户私有加密同步 | `plugin-workflow.zh.mdc` | 边界比 uTools 更清楚，应继续保持 |

## 4. uTools -> Tuff 机制映射表

| uTools 行为 | 用户体验 | 开发者模式 | Tuff 现状 | 风险 | 最小下一步 |
| --- | --- | --- | --- | --- | --- |
| 搜索框输入关键字触发插件 | 输入 `翻译` / `ocr` / 插件名即可看到动作 | `plugin.json` 声明功能指令 | Manifest `features[].commands`、`keywords`、CoreBox provider 已可搜索 | 指令冲突、排序不透明、插件结果伪成功 | 给 search trace 暴露 pluginName、featureId、matched command、provider status |
| 文本匹配触发插件 | 输入自然文本后自动推荐翻译、片段、AI 等 | 文本类 `cmds` / 动态逻辑 | `acceptedInputTypes: ["text"]`、`TuffQuery.text`、Prelude 动态返回 item | 短文本和选中文本来源混淆 | ContextAction input source 明确 `selected-text` / `clipboard-text` / `typed-query` |
| 图片匹配 OCR / 翻译 | 截图或剪贴板图片可直接 OCR/翻译 | 插件处理图片数据源 | `touch-translation` 的 screenshot feature 支持 `acceptedInputTypes: ["text", "image"]`；Assistant 剪贴板图片翻译已走同类 scene | 图片读取和 OCR provider 失败可能被包装成空态 | `clipboard-image` 输入必须展示 provider health、permission、empty-image、fallback reason |
| 文件/文件夹触发动作 | 选中文件后推荐压缩、重命名、打开、上传等 | 文件数据源匹配插件能力 | File mode / clipboard files 可构建 `TuffInputType.Files` | 路径权限、批量写入、Linux 桌面差异 | v1 只读列出和复制/打开；写入类动作必须 `fs.write` 二次确认 |
| 超级面板长按鼠标右键 | 用户在当前上下文看到插件动作 | 插件声明支持的数据类型 | Tuff 无同款鼠标面板；MetaOverlay / CoreBox 有入口基础 | 大改 UI 会偏离当前主线，也可能隐式读取隐私 | 只做 CoreBox/MetaOverlay Context Actions，不做桌面鼠标面板 |
| 插件市场安装 | 用户按场景安装插件 | 市场发布与审核 | Nexus Store、publisher、`.tpex`、review、content tab 已有切片 | 缺真实 `.tpex` 上传、审核、安装证据 | 用 `touch-snippets` 或 `touch-browser-data` 走一条 dry-run + local install + Store 展示 evidence |
| AI 制作插件 / 智能体 | 用户低门槛扩展能力，插件能力可面向 Agent 工具化 | 模板化插件生成；`tools` 需运行期注册 | Tuff 有 AI/Workflow dev 切片，但插件生成和工具注册不是闭环 | 生成未校验插件会绕过 sdkapi/权限审计；manifest-only tool 可能伪装成可调用 | AI 生成只输出草稿，必须经过 `tuff validate --strict`、权限说明审查和真实 register evidence |
| 插件数据同步/分享 | 用户可迁移数据或安装内容 | 插件存储和市场内容 | CloudSync / CloudShare 边界已写清 | 明文 JSON 同步、私有数据误发布 | 保持 SQLite SoT；CloudShare 包必须做敏感过滤与目标插件校验 |

## 5. 跨平台专项

### 5.1 文件搜索

| 平台 | uTools 预期体验 | Tuff 当前状态 | 必须 fail-closed / unsupported 的点 | 最小下一步 |
| --- | --- | --- | --- | --- |
| Windows | 本地文件匹配、路径/文件动作 | Everything provider + FileProvider fallback；已有 same-query fallback、CLI 手动选择、watch-root 过滤计划 | Everything SDK/CLI 都失败时不能返回“0 结果成功”；路径过滤失败不能泄露 watch-root 外结果 | 继续按 EV-060/070 补 SDK/CLI/unavailable 真机 evidence 和 P50/P95 |
| macOS | 文件搜索与打开 | FileProvider / Spotlight 方向已有 | TCC/Spotlight 不可用时必须 degraded，不要默默降为空 | 补 Spotlight/native/file-provider 样本和 permission reason |
| Linux | best-effort 文件搜索 | FileProvider / native provider，桌面环境差异大 | 无 indexer、无权限、目录不可访问时必须 unsupported/degraded | 文档声明 best-effort，输出 provider health |

### 5.2 系统动作

Tuff 的 `touch-system-actions` 与 `touch-window-manager` 当前依赖 `system.shell`，并在 Windows/macOS 开启、Linux 关闭或有限支持。这里必须坚持 fail-closed：

- `system.shell` 缺失：展示 `permission-missing`，执行返回 `blocked`。
- Linux 不支持窗口管理或指定浏览器打开：展示 `unsupported` / `linux-specific-browser-open-unsupported`。
- 关机、重启、锁屏、窗口关闭、批量脚本：必须二次确认或至少明确 action audit 字段。

不应为了接近 uTools 生态插件的丰富系统动作而重新开放裸 shell fallback。

### 5.3 窗口管理

| 能力 | Windows | macOS | Linux | Tuff 口径 |
| --- | --- | --- | --- | --- |
| 激活/关闭窗口 | 可通过脚本或 native transport 逐步替代 | AppleScript / accessibility 受权限影响 | 桌面环境差异过大 | 当前 `touch-window-manager` Linux false，合理 |
| 贴边/置顶/预设 | Windows 价值最高 | macOS 需 accessibility/automation 权限 | 不进入首版 | 先补真机多屏 evidence，再考虑 native transport |
| 前台应用上下文 | 可做动作推荐 | 需权限/可用性检查 | best-effort | Context Actions 中只能作为弱信号，不作为必需输入 |

### 5.4 剪贴板

uTools 的超级面板和剪贴板插件强化了“复制即动作”的心智。Tuff 已有 Clipboard SDK、clipboard-history、typed transport 和 `TuffQuery.inputs`，但需要补产品合同：

- 读取剪贴板必须由 `clipboard.read` 或系统已有 clipboard capture pipeline 支撑，并在用户可见入口说明来源。
- 写剪贴板低风险可自动授予，但自动粘贴必须展示失败 reason。
- 图片和文件不应把大体积 base64 长期塞进普通 JSON；图片原图优先走 `tfile://` 或临时引用。
- HTML 输入要区分 sanitized text 和 raw html，避免插件把富文本当纯文本误处理。

### 5.5 OCR / 翻译

uTools 把 OCR、快速翻译、聚合翻译放在常用场景里。Tuff 当前 `touch-translation`、OCR service、Assistant 剪贴板图片翻译已存在路径，但还缺 packaged evidence。能力边界：

- 无剪贴板图片：返回 `empty-clipboard-image`，不要打开空窗口。
- OCR provider 缺失或模型不可用：`degraded`，可以给手动复制/重试动作。
- 网络翻译 provider 未授权或 secret store degraded：必须显示 provider health 和 secret backend。
- 截屏能力需要 `window.capture` 或系统屏幕录制权限，拒绝时 fail-closed。

### 5.6 浏览器数据

uTools 插件生态可以扩展浏览器数据。Tuff 已有 `touch-browser-data` 首版只读扫描 Chrome/Edge/Brave/Arc Bookmarks JSON，并对 Linux Arc unsupported、read-failed、profileCount 等做 source diagnostics。下一步不要直接读取 History SQLite 作为默认功能：

- History 必须复制到临时只读副本后读取，限制最近 N 天/N 条。
- Safari 需要先输出 macOS 权限和数据库可行性调研。
- 浏览器数据 source 要支持 disable / clear index / rebuild index。
- `fs.read` 被拒绝或路径不存在时展示 `read-failed` / `not-found`，不能把“不支持”包装成“无书签”。

### 5.7 权限与降级 reason

跨平台能力统一采用这些状态：

| 状态 | 含义 | UI / 执行语义 |
| --- | --- | --- |
| `available` | 当前平台、权限、依赖都满足 | 可执行 |
| `permission-missing` | 平台支持，但用户未授权 | 展示授权动作；执行返回 `blocked` |
| `unsupported` | 当前平台或能力面不支持 | 不展示主动作，只展示说明 |
| `degraded` | 能力可部分工作，但质量下降 | 展示原因和可恢复动作 |
| `read-failed` | 数据源存在但读取失败 | 保留错误摘要，不伪装为空 |
| `not-found` | 数据源路径或依赖不存在 | 给安装/选择路径/重探测动作 |
| `blocked` | 执行前安全检查拒绝 | 返回 reason，不执行副作用 |

## 6. 超级面板 -> Tuff Context Actions 最小合同

目标不是桌面鼠标面板，而是一个统一的上下文动作数据合同，供 CoreBox、MetaOverlay、Assistant 或未来悬浮入口复用。

### 6.1 输入合同

| 输入 | 来源 | v1 是否做 | 说明 |
| --- | --- | --- | --- |
| `selected-text` | 当前应用选中文本，或用户显式传入 | 是 | 首版允许通过快捷键/MetaOverlay 触发；不做后台常驻抓取 |
| `clipboard-image` | 当前剪贴板图片 | 是 | 复用现有 clipboard image pipeline 和图片翻译 scene |
| `files` | File mode / 剪贴板文件路径 | 是 | 只读动作优先；写入类动作必须显式权限 |
| `clipboard-html` | 剪贴板富文本 | 后置 | 需要 sanitization 和 raw/text 双通道 |
| `active-app` | 当前前台应用 | 后置弱信号 | 只用于排序，不作为自动授权依据 |
| `screenshot-region` | 用户主动截图 | 后置 | 需要 `window.capture` 与屏幕录制 evidence |

### 6.2 Provider 输出合同

`ContextActionProvider` v1 建议输出：

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定 action id |
| `pluginName` / `featureId` | 对应插件和功能 |
| `title` / `subtitle` | 用户可读动作 |
| `inputTypes` | 支持的输入类型 |
| `inputSource` | `selected-text` / `clipboard-image` / `files` |
| `confidence` | 匹配置信度，用于排序 |
| `permission` | 需要的权限 id |
| `capability.status` | `available` / `permission-missing` / `unsupported` / `degraded` |
| `capability.reason` | 可读 reason，不允许为空泛 |
| `execute()` | 执行入口，必须返回 `started` / `blocked` / `failed` / `cancelled` |

### 6.3 首批插件接入

| 插件 | 输入 | 动作 | 风险控制 |
| --- | --- | --- | --- |
| `touch-translation` | selected text / clipboard image | 翻译、图片翻译 | network/intelligence/window 权限与 provider health |
| `touch-snippets` | selected text | 保存片段、复制模板 | `clipboard.read` 仅在读取剪贴板时请求 |
| `clipboard-history` | clipboard text/image/files/html | 打开历史、回贴 | 自动粘贴失败 reason |
| `touch-text-tools` | selected text | 格式化、大小写、编码 | 只读处理 + clipboard.write |
| `touch-browser-open` | selected text URL | 打开/搜索/复制 URL | Linux 指定浏览器 unsupported reason |
| `touch-batch-rename` | files | 批量重命名预览 | `fs.write` 前二次确认，不做默认执行 |

### 6.4 首版验收样本

首版验收不需要做新桌面面板，只需要证明“同一个上下文动作合同”能在现有入口里稳定工作：

| 样本 | 输入准备 | 预期动作列表 | 必须记录的 evidence | 不通过口径 |
| --- | --- | --- | --- | --- |
| 选中文本翻译 | 用户显式触发 selected text 入口，文本为 1~2 句 | `touch-translation`、`touch-text-tools`、`touch-snippets` 至少出现其一 | `inputSource=selected-text`、matched feature、permission/status/reason、执行结果 | 通过后台常驻抓取选中文本、无法区分 typed query 与 selected text |
| 剪贴板图片翻译 | 剪贴板存在图片，用户从 CoreBox/Assistant 触发 | 图片翻译动作可见，空剪贴板时只显示可读提示 | provider health、`window.capture`/intelligence 权限、`empty-clipboard-image` 或 fallback reason | 无图片时打开空窗口；provider 失败被包装成空结果 |
| 文件只读动作 | File mode 或剪贴板文件路径输入 | 打开、复制路径、预览类动作优先；批量写入类只展示预览 | file count、watch/root 或 permission reason、`fs.write` 二次确认状态 | 写入动作默认执行；路径不可读时仍显示 available |
| Linux unsupported | Linux 下触发窗口管理或指定浏览器打开 | 主动作降级或隐藏，说明 `unsupported` reason | platform、capability.status、reason、替代动作 | 把桌面环境差异包装成完整支持 |

这些样本要进入 release evidence，而不是只写进 SDK 文档。验收重点是“动作为何出现、为何不能执行、执行后发生了什么”三件事都有机器可读字段和用户可读提示。

## 7. 开发者体验专项

uTools 的开发者体验胜在低门槛；Tuff 应追求“低门槛 + 可审计”：

1. Quickstart 应继续以 `manifest.json` + `index.js` Prelude 为主，不让开发者一上来写 Surface。
2. `tuff create` 默认生成 `sdkapi: 260428`、`category`、最小权限和 `permissionReasons`。
3. `tuff validate --strict` 必须阻断缺 `sdkapi`、非 canonical marker、缺 category、权限理由缺失和平台声明不一致。
4. `tuff publish --dry-run` 应输出市场预览、权限风险摘要、平台支持矩阵和 `.tpex` manifest 摘要。
5. SDK 文档应增加“实现一个 uTools 超级面板式文本动作”的任务流，但命名为 Context Actions，避免误导为鼠标面板。
6. CloudShare 内容包继续只做公开/团队内容分发，CloudSync 继续只做用户私有加密同步。

### 7.1 开发者任务流验收口径

| 步骤 | Tuff 最小验收 | 失败时必须暴露 |
| --- | --- | --- |
| `tuff create` | 生成 `sdkapi: 260428`、`category`、最小权限、`permissionReasons`、Prelude `index.js` | 模板缺字段、旧 `entry/init`、非 canonical marker |
| 本地调试 | CoreBox 能看到 feature，item meta 带 pluginName/featureId/inputTypes | feature 未注册、命令冲突、输入类型不匹配 |
| `tuff validate --strict` | 阻断缺 `sdkapi`、权限理由缺失、平台声明不一致、危险权限无说明 | `SDKAPI_BLOCKED`、`permission-reason-missing`、`platform-mismatch` |
| `tuff build` | 生成 `.tpex` 与 manifest 摘要；不包含私有同步数据 | build artifact 缺 Prelude/Surface、内容包越界、明文业务数据 |
| `tuff publish --dry-run` | 输出市场预览、权限风险、平台支持矩阵和待审核说明 | 认证缺失、publisher 不匹配、审核资料不完整 |
| Store 安装 | 安装前展示权限和输入类型；安装后能在 CoreBox 搜到功能 | 安装失败 raw code、权限未解释、插件缺运行 evidence |

这套任务流比 uTools 更重，但重的是审计信息，不是开发负担。Tuff 应把 strict validate 和 dry-run 变成默认可见反馈，而不是让开发者到运行期才发现 `SDKAPI_BLOCKED` 或跨平台 unsupported。

## 8. 执行优先级

| 优先级 | 切片 | 验收 |
| --- | --- | --- |
| P0 | `context-actions-v1` 合同文档和最小实现 | selected text、clipboard image、files 能看到动作列表；每条动作有 permission/status/reason |
| P0 | 跨平台 fail-closed reason 对齐 | system/window/browser/file/OCR 执行失败不返回假成功；unsupported/degraded/read-failed 可见 |
| P0 | Context Actions evidence | Windows/macOS packaged 样本；Linux best-effort 文档化 |
| P1 | SDK 任务流补充 Context Actions 示例 | 开发者能从 Manifest 到 Prelude 到 validate/build/publish dry-run 完成一个文本动作插件 |
| P1 | Nexus Store 插件能力标签 | Store 展示 input types、platforms、permissions、capability health |
| P1 | Browser Data history/Safari 调研 | History SQLite / Safari 明确权限、限制和 unsupported reason |

## 9. 非目标

- 不复制 uTools 长按鼠标右键超级面板。
- 不默认后台抓取选中文本、图片或文件。
- 不为了兼容旧插件放松 `sdkapi` hard-cut。
- 不新增 raw IPC / legacy channel 作为插件主路径。
- 不把浏览器历史、剪贴板、OCR 图片、私有片段明文 dump 成 JSON 同步。
- 不把 Linux 桌面环境差异包装成完整支持。

## 10. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：任务只分析 uTools 插件机制与跨平台 | 通过 | 输出限定到本文件 |
| 2 | 官方事实 review：uTools 资料是否来自官方 | 通过 | 使用 uTools 官网、帮助中心、开发者文档、插件市场 |
| 3 | 仓库事实 enforce：不信旧 Done | 通过 live tree 核对 | 以 Manifest docs、`sdk-version.ts`、`useClipboardState.ts`、插件 manifest/index 为准 |
| 4 | 架构映射 review：是否覆盖 Manifest / Prelude / Surface、sdkapi、权限、TuffQuery | 通过 | 增加第 3、4 节 |
| 5 | 跨平台 enforce：必须明确 fail-closed / unsupported | 通过 | 增加第 5.1~5.7 节和状态表 |
| 6 | 超级面板 review：是否建议重做桌面鼠标面板 | 未建议 | 收敛为 Context Actions 最小合同 |
| 7 | KISS/YAGNI enforce：是否扩大到大重构 | 通过 | 首版只做 selected text / clipboard image / files |
| 8 | 安全/隐私 review：是否默认读取敏感数据 | 通过 | 浏览器历史、Safari、截图、HTML 后置并要求权限 reason |
| 9 | 生态 review：是否覆盖市场与开发者体验 | 通过 | 增加 tuff-cli、Nexus Store、CloudShare/CloudSync 边界，并补 uTools AI Agent tools 对 Tuff Intelligence / Workflow 的映射 |
| 10 | 文档完整性 enforce：是否包含映射表、优先级、来源 | 通过 | 补非目标、引用来源和源码证据 |

## 11. 引用来源

### uTools 官方来源

- uTools 官网：https://www.u-tools.cn/
- uTools 帮助中心 - 为什么使用 uTools：https://www.u-tools.cn/docs/guide/about-uTools.html
- uTools 帮助中心 - 超级面板：https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 帮助中心 - 功能指令：https://www.u-tools.cn/docs/guide/what-is-keyword.html
- uTools 帮助中心 - OCR：https://www.u-tools.cn/docs/guide/plugin-ocr.html
- uTools 帮助中心 - 剪贴板：https://www.u-tools.cn/docs/guide/plugin-clipboard.html
- uTools 开发者文档 - plugin.json：https://www.u-tools.cn/docs/developer/information/plugin-json.html
- uTools 开发者文档 - 动态增减功能：https://www.u-tools.cn/docs/developer/api-reference/utools/features.html
- uTools 开发者文档 - 为 AI Agent 提供能力：https://www.u-tools.cn/docs/developer/utools-api/tools.html
- uTools 开发者文档 - 发布插件：https://www.u-tools.cn/docs/developer/basic/publish-plugin.html
- uTools 插件应用市场：https://www.u-tools.cn/plugins/

### Tuff 仓库证据

- `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc`
- `apps/nexus/content/docs/dev/reference/manifest.zh.mdc`
- `apps/nexus/content/docs/dev/api/permission.zh.mdc`
- `apps/nexus/content/docs/dev/api/plugin-context.zh.mdc`
- `packages/utils/plugin/index.ts`
- `packages/utils/plugin/sdk-version.ts`
- `apps/core-app/src/main/modules/plugin/sdkapi-hard-cut-gate.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardState.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `plugins/clipboard-history/manifest.json`
- `plugins/touch-translation/manifest.json`
- `plugins/touch-browser-data/index.js`
- `plugins/touch-browser-open/index.js`
- `plugins/touch-system-actions/index.js`
- `plugins/touch-window-manager/index.js`
