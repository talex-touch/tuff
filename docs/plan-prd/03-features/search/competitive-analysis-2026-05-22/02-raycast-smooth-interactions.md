# Raycast 丝滑交互专项

> 日期：2026-05-22
> 范围：Raycast Search Bar、Action Panel、Quicklinks、Snippets、AI Commands、Translate、Clipboard History、Calculator、Emoji/Symbols、Window Management、菜单/键盘流，与 Tuff 当前 CoreBox / 插件 / OmniPanel / PreviewSDK 可复用路径对齐。
> 约束：只做产品与执行设计文档，不修改代码；不提出 CoreBox / 插件系统大重构；后续实现应以小切片、可验证、可回滚为准。

## 1. 结论

Raycast 的“丝滑”不是单个动画或 UI 样式，而是四个稳定交互合同叠加出来的：

1. **Search Bar 是状态机入口**：Root Search、命令参数、文件导航、URL detection、计算、Inline Translate 都在同一个输入区域内完成，用户不需要判断自己在哪个应用页面。
2. **Action Panel 是上下文动作层**：每个结果都有主动作、次动作、配置动作、复制/粘贴/编辑/收藏/禁用等上下文动作，并且动作可搜索、可分组、可进入子菜单。
3. **参数填充是统一能力**：Quicklinks、Snippets、AI Commands、command arguments 都复用 `{argument}` / `{clipboard}` / `{selection}` / `{date}` / `{time}` / `{uuid}` / `{calculator}` 等动态占位符，只是在不同场景使用不同输出格式。
4. **失败态可见但不打断主流**：Translate、Clipboard、File Search、Window Management 都明确展示权限、输入缺失、provider 不可用、平台限制，而不是把失败伪装成空结果。

Tuff 当前不是缺底座。`TuffQuery` 已能承接 text/image/files/html；插件 Feature 有 `acceptedInputTypes`；CoreBox 有 Action Panel、PreviewSDK、Clipboard inputs、Search trace 与 provider source；OmniPanel 已能抓 selected text 并执行 AI translate/summarize/rewrite/review；`touch-translation`、`touch-snippets`、`touch-browser-open`、`touch-quick-actions` 已覆盖很多具体能力。

真正差距是：**这些能力没有被抽成一个用户可理解的“参数填充 + 上下文动作 + 可见证据”模型**。因此最小下一步不是重做 CoreBox，而是做三个小合同：

| 合同 | 目标 | 首批落点 |
| --- | --- | --- |
| `TuffParameterSet` | 统一 URL template、AI command variables、snippet placeholders、command arguments、菜单/表单填参 | `touch-browser-open` / `touch-snippets` / OmniPanel AI action |
| `ContextActionProvider` | 把 selected text、clipboard image/files/html、focused item 转成动作候选 | OmniPanel + CoreBox Action Panel |
| `EvidencePayload` | 每次快速翻译/参数执行/Action Panel 动作都能显示 provider、input source、permission、latency、trace 或 failure reason | `touch-translation` + PreviewSDK + AI invoke result |

## 2. Raycast 丝滑交互模型

### 2.1 Search Bar：原地完成输入、导航和参数

Raycast Manual 把 Search Bar 定义为所有事情的起点，Root Search 是没有打开命令时的结果列表。关键体验包括：

- 空输入时显示 favorites、最近文件、上下文结果；开始输入后实时搜索应用、命令、文件、Quicklinks、Snippets、AI Commands、Calculator、URL。
- URL detection 会识别 URL 或裸域名，并自动补 `https://`。
- File Search 可以直接出现在 Root Search，也能用 `Tab` 进入目录、`Shift+Tab` 回到父目录。
- Command arguments 最多 3 个，选择命令后直接在 Search Bar 区域出现输入字段；字段类型包括 text、password、dropdown。
- alias 后跟空格可以直接聚焦第一个参数字段。
- ranking 结合 alias、title fuzzy、subtitle/keyword、frecency。

对 Tuff 的启发：CoreBox 需要避免“先进入插件页面才能填参数”。首批可以只支持 text/dropdown，不急着做完整表单渲染。

### 2.2 Action Panel：每个 item 都可继续动作

Raycast 的 Action Panel 不是右键菜单替代物，而是结果项的统一动作路由：

- `Enter` 执行 primary action，`Cmd/Ctrl+Enter` 执行 secondary action。
- `Cmd/Ctrl+K` 展开完整动作列表。
- action 分 section，并可通过搜索框 fuzzy 过滤。
- 支持子菜单和 inline view，例如设置 alias/hotkey。
- 常见动作覆盖 favorite、configure、deeplink、disable、reset ranking、copy、paste、open with、show details、send to AI。

Tuff 已有 `useActionPanel()`、MetaOverlay action bridge、`TuffItem.actions` 和内建 `toggle-pin` / `copy-title` / `reveal-in-finder` / `flow-transfer` / image translate actions。缺口是：

- Action Panel 搜索和 section 组织还没有成为插件开发合同。
- Quicklink / Snippet / Translate / Clipboard 的动作没有统一进入同一个上下文面。
- 动作失败缺少统一 evidence chip，例如 permission、provider、traceId、fallback reason。

### 2.3 参数填充：同一语义，多处复用

Raycast 的参数系统横跨四条线：

| 场景 | Raycast 表现 | 关键点 |
| --- | --- | --- |
| Quicklinks | URL/file/deeplink 支持 `{argument}`、剪贴板、日期、UUID、计算等动态占位符 | 打开前提示参数，URL 默认 percent encode |
| Snippets | keyword expansion、手动搜索粘贴、动态占位符、cursor | 系统级插入与光标位置是体验核心 |
| AI Commands | prompt 可插入 Dynamic Placeholder 和 AI Extension | `{selection}` 与 `{argument name="Language"}` 让 prompt 可运行时填参 |
| Command Arguments | manifest 声明最多 3 个参数，Root Search 直接填 | text/password/dropdown 类型，参数值进入 command props |

Tuff 当前分散实现：

- `packages/utils/core-box/tuff/tuff-dsl.ts`：`TuffQuery.text` 和 `inputs` 已区分主动输入与附加输入，支持 text/image/files/html。
- `packages/utils/plugin/index.ts`：`IPluginFeature.acceptedInputTypes` 已声明 feature 接收类型；`omniTransfer.payload` 可作为默认 payload template。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`：按 input type 过滤 feature，非 text input 只展示能接收对应类型的 feature。
- `plugins/touch-snippets/index.js`：已支持 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`。
- `plugins/touch-browser-open/index.js`：搜索引擎 URL builder 已有 `buildSearchUrl(query)`，但没有 Quicklink schema。
- `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts`：AI action 已能把 selected text/capsule 转成 `text.translate`、`text.summarize`、`text.rewrite`、`code.review` 等 payload。

建议不要新建“大模板引擎”。最小统一模型如下：

```ts
type TuffParameterSource =
  | 'query.text'
  | 'query.input'
  | 'clipboard'
  | 'selection'
  | 'literal'
  | 'runtime'
  | 'calculator'
  | 'date'
  | 'time'
  | 'uuid'

interface TuffParameterSpec {
  name: string
  label?: string
  type: 'text' | 'password' | 'dropdown' | 'boolean'
  required?: boolean
  defaultValue?: string
  options?: Array<{ label: string; value: string }>
  source?: TuffParameterSource
  modifiers?: Array<'trim' | 'uppercase' | 'lowercase' | 'percent-encode' | 'json-stringify' | 'raw'>
}

interface TuffParameterSet {
  version: 1
  params: TuffParameterSpec[]
  evidence?: {
    inputSource?: string
    permission?: string
    provider?: string
    traceId?: string
    failureReason?: string
  }
}
```

首批只需要把它作为 **描述与解析合同**，不要强行迁移所有插件：

1. `touch-browser-open` 增加 manual quicklink 数据时复用 `TuffParameterSet`，URL 输出默认 `percent-encode`。
2. `touch-snippets` 把现有 `{{date}}/{{time}}/{{uuid}}/{{clipboard}}` 映射到同一 resolver，保持旧语法兼容。
3. OmniPanel AI actions 把 selected text 显式标记为 `selection` source，把 provider/model/traceId 进入 evidence。
4. Plugin manifest 后续可加 `parameters?: TuffParameterSpec[]`，不影响现有 `commands`。

## 3. Raycast -> Tuff 功能映射表

| Raycast 行为 | 体验细节 | Tuff 可复用路径 | 缺口 | 最小设计 | 验证证据 |
| --- | --- | --- | --- | --- | --- |
| Root Search 一入口 | 应用、命令、文件、URL、Quicklinks、Snippets、AI、Calculator 共用搜索框 | CoreBox、SearchCore、PreviewProvider、PluginFeatureAdapter | 文件/Quicklinks/Snippets/AI 的证据不在同一 search trace | 给 Search trace 增加 `interactionSurface: root-search/action-panel/omni-panel` | 5 组 trace：app/file/preview/snippet/translate |
| Command Arguments | 选择命令后 Search Bar 原地出现最多 3 个参数，支持 text/password/dropdown | `IPluginFeature.commands`、`TuffQuery`、`omniTransfer.payload` | Tuff 没有 manifest 参数字段和原地参数 UI | 先加 `parameters?: TuffParameterSpec[]`，只支持 text/dropdown | 一个 demo feature：`Open URL Template` |
| Action Panel | 每个 item 有主动作、次动作、配置、复制、禁用、子菜单 | `TuffItem.actions`、`useActionPanel()`、MetaOverlay action bridge | Action 搜索/分组/失败证据不足 | 先统一 action group、shortcut、evidence toast | 对 app/file/image/snippet/quicklink 各开一次 action panel |
| Quicklinks 动态参数 | URL/file/deeplink 可用 `{argument}`、clipboard、date、uuid、calculator | `touch-browser-open`、`touch-browser-bookmarks`、`touch-browser-data` | 缺统一 quicklink 数据模型和参数 resolver | `QuicklinkSource` + `TuffParameterSet`，默认 URL encode | Google Translate URL template 三参数样本 |
| Snippets placeholders | keyword auto-expansion、tags、cursor、clipboard、date/time/uuid/calculator | `touch-snippets` 已有搜索、复制、保存、pack、4 个 placeholder | 无 cursor/calculator/browser-tab、无系统级热字符串 evidence | 保持手动复制为 V1；V1.1 只补 resolver contract 和 cursor 后置 | 插件测试覆盖旧 placeholder 与 resolver |
| AI Commands | selected text + prompt + model/creativity/reasoning，支持 argument placeholder | OmniPanel AI actions、Tuff Intelligence SDK、Workflow Use Model | 缺用户可创建/管理 AI Command 的轻量入口 | 先把 OmniPanel 内置动作沉淀为 `aiCommandTemplates` | selected text -> translate/summarize/rewrite 三条 evidence |
| Translate | 打开后双栏实时翻译；Root Search inline translation；可用 selected text hotkey 自动填源文本 | `touch-translation`、OmniPanel Quick Translate、Assistant clipboard image translate | 文本翻译和图片翻译分散；provider health/evidence 还不够统一；inline translation 未产品化 | 先做 `translate {text} to {language}` 参数模型；provider chips 统一 | 文本、selected text、clipboard image、permission denied、provider failed |
| Clipboard History | 多类型历史、过滤、OCR、Paste as、Save as Snippet、Send to AI、retention/disabled apps | Clipboard module、clipboard-history plugin、TuffQuery inputs、Clipboard SDK | 图片/文件/HTML action 与隐私 retention evidence 不足 | ContextActionProvider 先消费 latest clipboard，不默认扩大留存 | text/image/files/html 四类输入匹配 feature |
| Calculator | Root Search 直接自然语言计算，Enter 复制答案 | PreviewSDK、PreviewProvider 显式 `calc/计算` 前缀、clipboard history | Tuff 目前更像显式前缀，不是全自然 Root Search | 不扩大解析范围；先补 discoverability 和 `{calculator}` parameter source | `calc 2+2`、`计算 1m to cm`、参数 resolver 计算 |
| Emoji/Symbols | 自然语言搜索、分类、AI fallback、自定义 keyword、paste/copy/pin | `touch-emoji-symbols` | 数据集、recent、AI fallback 和 action evidence 后置 | 只补 action evidence 和 recent，不接云同步 | Enter paste / copy unicode / pin 三动作 |
| Window Management | 键盘 resize/move/desktop/custom command，首次权限提示 | `touch-window-manager`、`touch-window-presets`、`touch-quick-actions` shell capability | 多屏/权限/平台差异 evidence 不足 | 保持 capability metadata，Action Panel 显示 unsupported reason | Windows/macOS 多屏 smoke，Linux best-effort reason |
| File Search actions | Root Search 文件、Tab 目录导航、Action Panel Quick Look/Open Terminal/Save Quicklink/Send to AI | FileProvider、EverythingProvider、SystemActionsProvider、Action Panel | Tuff FileProvider 语义更强，需要 watch-root/permission evidence | 文件 item action 标准化为 open/reveal/copy path/save quicklink/send to AI | Everything SDK/CLI/unavailable + watch-root 样本 |
| 菜单/键盘流 | `Enter` primary，`Cmd/Ctrl+K` action，箭头/section/page navigation，forms `Tab`/submit | `useKeyboard.ts`、Action Panel、CoreBox grid/list navigation | 快捷键文档与 UI 提示未按 action 合同统一 | Action row 显示 shortcut，表单参数 UI 复用同一快捷键 | keyboard-only walkthrough 视频或日志 |

## 4. 参数填充专项

### 4.1 URL template

Raycast Quicklinks 的关键不是“打开网址”，而是 URL 模板在打开前能拿到 runtime 参数。Tuff 当前 `touch-browser-open` 已有搜索引擎 `buildSearchUrl(query)`，但这个 query 是内部函数参数，不是用户可管理的 Quicklink 模型。

最小方案：

- 新增 `manualQuicklinks.json` 或进入插件 storage，字段为 `id/title/urlTemplate/openWith/tags/parameters`。
- `urlTemplate` 支持 `{paramName}`，先不支持嵌套表达式。
- `parameters` 使用 `TuffParameterSpec[]`；默认 URL 场景对参数做 `percent-encode`。
- `clipboard` / `selection` 参数必须在 UI 上显示 source，不静默读取。
- 打开失败返回 `started/blocked/failed`，并带 `capability.reason`。

不做：

- 不写回浏览器书签。
- 不接云同步。
- 不做无限参数或复杂脚本模板。

### 4.2 AI command variables

Raycast AI Commands 让 prompt 插入 `{selection}`、`{argument}`、browser tab 等变量。Tuff 当前 OmniPanel AI actions 已有固定动作，但用户还不能把 prompt 保存成命令。

最小方案：

- 先定义 `AiCommandTemplate`：`id/title/capabilityId/promptTemplate/parameters/defaultModelHint/tags`。
- 首批 template 只允许 `text.translate`、`text.summarize`、`text.rewrite`、`code.review`。
- 输入源只支持 `selection`、`query.text`、`clipboard.text`。
- 执行结果必须展示 provider/model/latency/traceId，失败展示 recovery。

### 4.3 Snippet placeholders

`touch-snippets` 已支持 4 个 placeholder，足够 V1。但如果要对齐 Raycast，不能只继续硬编码 `replace()`。

最小方案：

- 抽一个小 resolver，先兼容 `{{date}}` 旧语法，再允许新语法 `{date}`。
- `clipboard` 需要 permission reason；无权限或无内容时展示 evidence，不把 placeholder 替换成空字符串后当成功。
- `cursor` 后置，必须等自动粘贴/插入合同明确后再做。
- `{calculator}` 可复用 PreviewSDK 纯计算能力，不再写第二套计算器。

### 4.4 Command arguments

Tuff 插件 feature 当前能声明 `commands`，但不能声明参数字段。建议后续新增：

```ts
interface IPluginFeature {
  parameters?: TuffParameterSpec[]
}
```

执行链：

1. Root Search 命中 feature。
2. 如果 feature 有 required 参数且 query 未满足，则进入参数输入状态。
3. 参数值写入 `TuffQuery.context.parameters` 或 `query.inputs[].metadata.parameters`。
4. `onFeatureTriggered(featureId, query, feature, signal)` 继续保持兼容，插件从 `query.context?.parameters` 读新值。

首批只做一个参数输入面，不支持复杂多步骤 wizard。

### 4.5 表单/菜单填参

Raycast extension Form 支持 draft、validation、submit shortcut；ActionPanel.Submenu 支持懒加载和搜索。Tuff 不需要照搬 React API，但可以借鉴合同：

- 参数输入态需要 draft，但 password 不保存 draft。
- validation 在 blur 或 submit 时触发，错误阻止执行。
- 子菜单用于选择语言、浏览器、窗口 preset、provider，不要让用户先打开设置页。

## 5. 快速翻译专项

### 5.1 Raycast 体验拆解

Raycast Translate 的顺滑点：

- 直接打开 Translate，输入或粘贴文本，结果实时更新。
- 来源语言默认 Detect，目标语言记住上次设置或 Settings 默认值。
- Root Search 支持 `hello in german` 这种 inline translation。
- Action Panel 支持 copy source、copy translation、paste to active app、swap languages、change language、continue in AI Chat。
- Hotkey 启动时可自动使用前台 app selected text。
- Custom translate commands 可固定语言对并出现在 Root Search。

### 5.2 Tuff 当前基线

`touch-translation` 已具备：

- `touch-translate`、`multi-source-translate`、`screenshot-translate` 三个 feature。
- `acceptedInputTypes` 覆盖 text 和 image。
- `resolveTextToTranslate()` 能从 query text 或 image OCR 得到文本。
- Provider 包括 Tuff Intelligence、Google、DeepL、Bing、Baidu、Tencent、Caiyun、Custom、MyMemory。
- Provider secret 通过 `plugin.secret` merge，不再直接依赖普通配置字段。
- Network / AI permission 会先检查再执行。
- Widget state 有 provider pending/success/error、detectedLang、targetLang、traceId。
- 图片翻译可调用 `image.translate.e2e` 并通过 DivisionBox 展示结果。

缺口：

- 文本、selected text、clipboard image、截图翻译、Assistant 入口和 OmniPanel 入口不是同一个 evidence 模型。
- provider health 没有在 CoreBox/OmniPanel/Action Panel 中统一成 chips。
- inline translation 尚未作为 Root Search 场景产品化。
- 失败态虽然有文案，但缺统一 `inputSource/provider/permission/traceId/latency/failureReason`。
- 隐私边界需要写清：selected text / clipboard / screenshot/image 不能被默认上传；必须由 feature 和 permission 触发，并能显示 provider。

### 5.3 最小落地建议

| 切片 | 范围 | 验收 |
| --- | --- | --- |
| `translate-evidence-v1` | 给文本翻译、图片翻译、OmniPanel AI translate 统一 evidence payload | UI 上可见 input source、provider、model、latency、traceId、permission/failure reason |
| `translate-selected-text-v1` | OmniPanel selected text -> translation plugin / AI translate | 有 selected text captured/empty/disabled 三态 |
| `translate-inline-v1` | Root Search 识别 `... in/into language`，只在明确语言名时出结果 | 不抢普通搜索；语言名至少 3 字符；失败时不出假成功 |
| `translate-action-panel-v1` | 翻译结果 Action Panel 支持 copy/paste/swap/send to AI | 每个 action 有 shortcut、permission、失败 toast |
| `translate-privacy-v1` | 设置与文档声明输入来源、provider、secret backend、日志脱敏 | 不记录原文到日志；trace 只记录长度/hash/provider |

### 5.4 快速翻译 evidence 格式

建议翻译类 item / widget payload 都带：

```ts
interface TranslationEvidence {
  inputSource: 'query' | 'selection' | 'clipboard-text' | 'clipboard-image' | 'screenshot'
  inputType: 'text' | 'image'
  inputLength?: number
  sourceLanguage?: string
  targetLanguage: string
  providerId?: string
  providerLabel?: string
  providerStatus: 'pending' | 'success' | 'error' | 'blocked'
  permission?: 'network.internet' | 'intelligence.basic' | 'clipboard.read' | 'window.create'
  latencyMs?: number
  traceId?: string
  failureReason?: string
}
```

## 6. Tuff 最小复用路线

### P0：不改大架构，先建立合同

1. 写 `TuffParameterSet` 类型和 resolver 单测，先放 `packages/utils/core-box/parameters` 或 plugin utils。
2. `touch-snippets` 改用 resolver，但保持旧 `{{...}}` 语法。
3. `touch-browser-open` 新增 manual quicklink V1，复用 resolver。
4. `touch-translation` 输出统一 `TranslationEvidence`。
5. CoreBox Action Panel 增加 action group/search/evidence 的最小 UI，不碰插件生命周期。

### P1：让上下文动作真正可见

1. `ContextActionProvider` 只接 selected text、clipboard image、clipboard files。
2. 把 translate、save as snippet、send to AI、open URL、copy/paste 作为首批动作。
3. OmniPanel 与 CoreBox Action Panel 共用同一动作描述，不复制业务逻辑。

### P2：补 Raycast 体验细节

1. Snippet cursor / calculator placeholder。
2. Quicklink tag/pin/filter。
3. Emoji custom keywords / recent。
4. Window preset custom command deeplink。
5. Clipboard OCR / Save as Snippet / Send to AI。

## 7. 风险与边界

| 风险 | 处理 |
| --- | --- |
| 参数模型变成新框架 | 只做 schema + resolver，不新建复杂 runtime |
| selected text 隐私风险 | 必须用户触发；UI 显示 captured/empty/disabled；不默认发送到网络 |
| clipboard 自动读取过度 | 仅 feature `acceptedInputTypes` 命中时消费；记录 input source，不记录原文 |
| translation provider 泄露 secret | 继续使用 `plugin.secret`，普通 config 只存 metadata |
| Action Panel 动作太多 | 先按 group/shortcut/evidence 展示，搜索动作后置但要保留合同 |
| Calculator 重复实现 | `{calculator}` 只调用 PreviewSDK 静态能力，不复制公式解析 |
| Browser tab placeholder | 后置到 Browser Data / browser extension 能力明确后，不伪造 |

## 8. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只负责任务 2/10，不改代码 | 通过 | 输出限定到指定 `02-raycast-smooth-interactions.md` |
| 2 | 基线 review：读取 01 总览、gap matrix、App Data roadmap、README/TODO | 通过 | 沿用“产品缺口 vs 证据缺口”，不重复基础能力总览 |
| 3 | Raycast 官方事实 enforce | 通过 | 以 Manual / Developers docs 为主，覆盖 Search Bar、Action Panel、Quicklinks、Dynamic Placeholders、Translate 等 |
| 4 | Tuff live tree review | 通过 | 用 live source 确认 `TuffQuery`、`acceptedInputTypes`、PreviewProvider、OmniPanel、translation/snippets/browser-open/quick-actions |
| 5 | 参数填充专项 enforce | 通过 | 单独拆 URL template、AI command variables、snippet placeholders、command arguments、表单/菜单填参 |
| 6 | 快速翻译专项 review | 通过 | 明确 input source、provider health、失败态、隐私边界、可见 evidence |
| 7 | KISS/YAGNI enforce | 发现不应引入大模板引擎 | 收敛为 `TuffParameterSet` schema + resolver，不改主架构 |
| 8 | 复用路径 review | 通过 | 优先复用 PreviewSDK、OmniPanel AI actions、PluginFeatureAdapter、touch-translation provider state |
| 9 | 风险 review | 通过 | 对 selected text、clipboard、secret、browser-tab、calculator 重复实现列出边界 |
| 10 | 文档完整性 enforce | 通过 | 包含结论、映射表、最小模型、快速翻译、路线、风险、引用来源 |

## 9. 引用来源

### Raycast Manual

- Search Bar: https://manual.raycast.com/search-bar
- Action Panel: https://manual.raycast.com/action-panel
- Quicklinks: https://manual.raycast.com/quicklinks
- Dynamic Placeholders: https://manual.raycast.com/dynamic-placeholders
- Snippets: https://manual.raycast.com/snippets
- AI Commands: https://manual.raycast.com/ai/ai-commands
- Clipboard History: https://manual.raycast.com/clipboard-history
- Translate: https://manual.raycast.com/translate
- Calculator: https://manual.raycast.com/calculator
- Emoji & Symbols: https://manual.raycast.com/emoji-symbols
- Window Management: https://manual.raycast.com/window-management
- File Search: https://manual.raycast.com/file-search
- Keyboard Shortcuts: https://manual.raycast.com/keyboard-shortcuts

### Raycast Developers

- Arguments: https://developers.raycast.com/information/lifecycle/arguments
- Form: https://developers.raycast.com/api-reference/user-interface/form
- Action Panel API: https://developers.raycast.com/api-reference/user-interface/action-panel

### Tuff 仓库证据

- `packages/utils/core-box/tuff/tuff-dsl.ts`
- `packages/utils/plugin/index.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/box-tool/addon/preview/preview-provider.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/context-provider.ts`
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/manifest.json`
- `plugins/touch-snippets/index.js`
- `plugins/touch-browser-open/index.js`
- `plugins/touch-quick-actions/index.js`
