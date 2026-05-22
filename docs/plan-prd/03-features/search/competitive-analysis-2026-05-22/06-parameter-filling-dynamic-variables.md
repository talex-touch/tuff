# 参数填充与动态变量统一专项

> 日期：2026-05-22
> 范围：Raycast Quicklinks / Snippets Dynamic Placeholders / AI Commands、Alfred workflow variables / configuration、uTools 功能指令 / 动态指令，与 Tuff 当前 snippets、browser open、translation、OmniPanel、TuffQuery、PluginFeature、Intelligence Workflow、Flow payload 对照。
> 约束：只输出竞品分析与 contract 建议；不改代码；不提出大框架；首版只让 snippets / quicklinks / translation / AI commands 共享一套薄变量解析规则。

## 1. 结论

Raycast、Alfred、uTools 对“参数填充”的共同答案不是复杂表单，而是把用户当前输入、剪贴板、选中文本、文件/图片、运行时配置和中间变量变成可声明、可校验、可追踪的变量流。

Raycast 的优势是 **统一 placeholder 心智**：Quicklinks、Snippets 和 AI Commands 都能复用 `{clipboard}`、`{selection}`、`{argument}`、`{date}`、`{time}`、`{uuid}`、`{calculator}` 等动态占位符，并通过 modifiers 控制 trim、大小写、percent encode、JSON stringify 和 raw 输出。用户只需要理解一次变量语法。

Alfred 的优势是 **workflow 变量生命周期**：`{query}`、`arg`、workflow variables、session variables、item variables、environment variables、Workflow Configuration 分工清晰，变量能从 Script Filter JSON item 流入后续节点，也能通过 Arg and Vars 在一次 workflow run 内传递。

uTools 的优势是 **输入类型匹配**：`plugin.json` 中的 `features[].cmds` 同时支持功能指令和匹配指令，能按 regex、over、img、files、window 等输入类型推荐插件能力；`utools.setFeature()` 又让网页快开一类用户配置可以变成动态指令。

Tuff 当前已经有底座，但变量模型是散的：

| Tuff 散点 | 当前事实 | 主要缺口 |
| --- | --- | --- |
| `TuffQuery` | `text` 与 `inputs` 已区分主动输入和剪贴板/附加输入，支持 text/image/files/html | 还不是统一变量 resolver |
| `acceptedInputTypes` | 插件 feature 可声明 text/image/files/html | 只能表达“能接收什么”，不能表达“参数怎么填、怎么验证、怎么展示” |
| `touch-snippets` | 支持 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}` | placeholder 由插件内硬编码替换，失败态和隐私等级不统一 |
| `touch-browser-open` | 搜索引擎 `buildSearchUrl(query)` 已做 URL encode | 没有用户可管理 Quicklink schema，也没有共享参数 spec |
| `touch-translation` | 可从 `query.text` 或 `query.inputs.image` 解析文本/图片输入 | 文本、截图、AI/OCR provider evidence 分散 |
| OmniPanel | `OmniPanelContextPayload` 可承接 selected text、capture source、support level 和 issue code | selected text 尚未成为所有能力共享的变量源 |
| Flow payload | `FlowPayload` 支持 text/image/files/json/html/custom，并保留 originalQuery context | 与 CoreBox 参数、AI workflow 参数未统一 |
| Intelligence Workflow | `WorkflowDefinitionStep.inputSources` 和 contextSources 已存在 | 偏 AI workflow；不应反向拖大普通插件参数模型 |

最小下一步应是 **`TuffVariableContract v1`**：只定义变量来源、类型、默认值、校验、隐私等级、展示、失败态和 SDK 表达方式；首批落在 `touch-snippets`、Quicklinks/manual browser open、`touch-translation`、OmniPanel/AI Commands。不要先做大型 workflow 引擎、表单平台、热字符串注入系统或全局鼠标面板。

## 2. 竞品参数模型横向

### 2.1 Raycast：一套 Dynamic Placeholders 贯穿三类能力

| 能力 | 参数填充方式 | 值得吸收 | 不宜照搬 |
| --- | --- | --- | --- |
| Quicklinks | URL/file/deeplink 中使用 dynamic placeholders；Quicklinks 默认 percent encode 特殊字符 | URL 模板默认安全编码，打开前收集必填 argument | 不必首版支持 browser extension 级页面内容抽取 |
| Snippets | 片段展开时替换 date/time/clipboard/cursor/calculator 等 placeholder | Snippets 与 Quicklinks/AI Commands 共享变量语法 | 系统级 hot string/autopaste/cursor 要等插入失败态明确后再做 |
| AI Commands | prompt 中插入 `{selection}`、`{argument}`、clipboard、date、browser-tab 等 | selected text 与 argument 是 AI 命令天然输入源 | AI Extension / browser-tab 需要 Provider 和浏览器扩展边界，不进 v1 |
| Arguments | `{argument}` 可命名、复用、设置 default、options；必填参数未填写时命令不能运行 | 参数 spec 应支持 name/default/options/required | 不需要首版完全复制最多 3 个参数限制，但 Tuff v1 可主动限制为 3 个降低 UI 成本 |
| Modifiers | `trim`、`uppercase`、`lowercase`、`percent-encode`、`json-stringify`、`raw` | modifiers 是轻量且跨场景复用的最小抽象 | 不做任意表达式或脚本 modifier |

Raycast 对 Tuff 的直接启发：变量语法必须跨 Snippet、Quicklink、AI Command 共享；URL 场景默认 percent encode，AI prompt 场景默认做边界包裹或至少保留 source/evidence；`raw` 必须显式声明。

### 2.2 Alfred：变量是 workflow 对象流的一部分

| Alfred 概念 | 参数语义 | 对 Tuff 的启发 |
| --- | --- | --- |
| `{query}` / `arg` | 用户当前输入或 Script Filter item 选中后传给下游的主参数 | Tuff `TuffQuery.text` 是主动输入，不应和 clipboard/selection 混淆 |
| Workflow variables | `{var:name}` 在 Alfred 对象内展开；脚本中作为 environment variables 使用 | Tuff 参数 resolver 应区分 UI 展示值和执行期 env/metadata 值 |
| Arg and Vars | 在 workflow 中动态设置变量，供后续节点使用 | Tuff v1 可保留 `vars` 命名空间，但不做完整节点图 |
| Workflow Configuration | 安装后由用户填写 API key、选项、默认值等静态配置 | Tuff 普通配置走 plugin storage；secret 走 secure store，只传 `secretRef` |
| Script Filter JSON variables | JSON 顶层 variables 作为 session variables；item variables 可覆盖同名变量 | Tuff item/action payload 可以借鉴 item-level variables，但必须 redaction |
| Script run behavior | 支持 queue、rerun、trim whitespace 等 | Tuff resolver 需要 abort signal、超时、trim modifier 和 stale result guard |

Alfred 对 Tuff 的直接启发：变量不能只是字符串替换。它有生命周期：声明、采集、解析、传递、覆盖、过期、调试。Tuff 不需要复制 Alfred 画布，但应把 variable resolution evidence 写进 item meta / run trace / plugin logs。

### 2.3 uTools：按输入类型推荐功能，动态指令补用户配置

| uTools 概念 | 参数/输入语义 | 对 Tuff 的启发 |
| --- | --- | --- |
| 功能指令 | 搜索框直接输入短指令打开插件功能 | Tuff `commands` / `keywords` 应短、明确、可追踪 matched command |
| `regex` 匹配指令 | 对文本做正则匹配，常用于 URL、手机号、公式等 | Tuff 可后置做 `variable.validation.pattern`，不要让插件各写一套 |
| `over` 匹配指令 | 任意文本匹配，带 min/max/exclude | Tuff selected text / typed query 可用同类边界控制，避免短文本污染 |
| `img` | 剪贴板/截图图片输入触发 OCR、保存、翻译等 | Tuff `TuffInputType.Image` 已可承接，但必须显示 source 和 provider health |
| `files` | 文件/文件夹输入触发批处理、重命名、文档处理等 | Tuff `TuffInputType.Files` 与 Flow files 可对齐，写入类动作需二次确认 |
| `window` | 当前活动窗口作为匹配条件 | Tuff active-app/window 只能先做弱信号或 explicit context，不默认授权 |
| 动态指令 | `utools.setFeature(feature)` 为用户配置动态增删功能 | Tuff Quicklinks 可以用 storage 中的 manual quicklinks 生成动态 feature/item |

uTools 对 Tuff 的直接启发：参数源不只有搜索框。选中文本、剪贴板图片、文件路径、当前窗口都可能是触发条件和参数值。但 Tuff 必须比 uTools 更明确权限、隐私等级、降级 reason 和 SDK hard-cut。

## 3. Tuff 当前证据对照

| 领域 | 当前证据 | 现状判断 | 统一模型缺口 |
| --- | --- | --- | --- |
| Query 基础结构 | `packages/utils/core-box/tuff/tuff-dsl.ts` 定义 `TuffQuery.text`、`TuffQuery.inputs`、`TuffQueryInput.type/content/rawContent/thumbnail/metadata` | text/image/files/html 已进入 CoreBox DSL | 缺 `context.variables` / `parameters` 命名空间 |
| PluginFeature 输入声明 | `packages/utils/plugin/index.ts` 的 `IPluginFeature.acceptedInputTypes` | 插件能声明 text/image/files/html；`onFeatureTriggered` 接收 string 或 TuffQuery | 缺 `parameters?: TuffVariableSpec[]` 和失败态标准 |
| 输入类型过滤 | `plugin-features-adapter.ts` 会按 `acceptedInputTypes` 过滤非 text 输入 feature | 已防止图片/文件误进 text-only feature | 缺输入 source/evidence 在用户层可见 |
| Snippets placeholders | `plugins/touch-snippets/index.js` 的 `applyPlaceholders()` 替换 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}` | 首批 placeholder 可用 | clipboard 无内容/无权限时容易被替换为空，缺统一 failure |
| Browser Open / Search | `plugins/touch-browser-open/index.js` 中 search engine `buildSearchUrl(query)` 使用 `encodeURIComponent`；动态 search feature 已存在 | 搜索引擎参数化已散点实现 | 缺 QuicklinkSource schema 和共享 URL template resolver |
| Translation 输入 | `plugins/touch-translation/index/main.ts` 从 `query.text` 和 `query.inputs.image` 提取文本/图片，OCR 后翻译 | 文本/图片输入已打通 | provider health、OCR empty、permission denied 未进入统一 variable evidence |
| OmniPanel selected text | `apps/core-app/src/shared/events/omni-panel.ts` 定义 `OmniPanelContextPayload.text`、`hasSelection`、`selectionSupportLevel`、`selectionIssueCode` | selected text 有结构化 payload | 尚未成为 Quicklink/Snippet/AI Command 共享变量源 |
| Flow payload | `packages/utils/types/flow.ts` 支持 text/image/files/json/html/custom，并带 `context.originalQuery` | 插件间结构化数据传递存在 | Flow payload 与 CoreBox query/AI workflow 参数命名空间未统一 |
| Intelligence workflow | `packages/utils/types/intelligence.ts` 有 workflow triggers、contextSources、steps、inputSources；AI orchestration 可执行 model step | AI workflow 已有参数和上下文来源 | 不应把 AI workflow 的复杂度下放到普通 snippets/quicklinks v1 |
| AI command 样态 | `plugins/touch-intelligence/index.js` 把 prompt、OCR text、inputKinds、provider/model/traceId/latency 进 payload/meta | AI invoke evidence 已有实践 | 用户可自定义 AI Command 模板还未成产品合同 |

## 4. 统一参数模型建议

### 4.1 变量来源

| 来源 | 示例 | 隐私等级 | v1 用法 |
| --- | --- | --- | --- |
| `query.text` | CoreBox 输入 `translate hello` | local | Quicklink argument、translation text、AI prompt |
| `query.inputs.text` | clipboard text 或 context text | context | Snippet clipboard、Context Actions |
| `query.inputs.image` | 剪贴板图片 data URL / temp ref | sensitive | 图片翻译、OCR，不长期落普通 JSON |
| `query.inputs.files` | 文件路径数组 | sensitive | 只读文件动作；写入需权限和二次确认 |
| `query.inputs.html` | HTML raw + plain text | sensitive | 后置；必须区分 sanitized text 与 raw html |
| `selection.text` | OmniPanel selected text | context | 翻译、AI command、quick search |
| `clipboard.text` | 最近剪贴板文本 | context/sensitive | 需要 `clipboard.read` 或现有 capture pipeline evidence |
| `item.meta` | 当前 CoreBox item 的 title/url/path/action payload | local/context | Save as Quicklink、Send to AI、Flow share |
| `flow.payload` | text/files/html/json payload | local/sensitive | 插件间传递，不直接替代 query |
| `workflow.context` | AI workflow contextSources | context/sensitive | AI workflow 内使用，不扩大到普通 v1 |
| `runtime.date/time/uuid` | 当前时间、随机 UUID | public | Snippet/Quicklink/AI prompt |
| `runtime.calculator` | 计算表达式结果 | local | 复用 PreviewSDK，不写第二套计算器 |
| `config.value` | 默认语言、默认浏览器、搜索引擎 | local | 来自 plugin storage/settings |
| `secret.ref` | provider key 引用 | secret | 只传 ref/health，不传明文 |

### 4.2 生命周期

| 阶段 | 说明 | 必须记录 |
| --- | --- | --- |
| Declare | manifest / plugin storage / built-in template 声明参数 | name、type、source、required、privacy、default、validation |
| Collect | 从 query、selection、clipboard、config、runtime 采集候选值 | inputSource、permission、capturedAt、support level |
| Resolve | 按默认值、source 优先级和 modifiers 计算最终值 | resolved / missing / blocked / invalid |
| Validate | 类型、长度、pattern、enum、URL、file path、privacy policy | errorCode、reason、field |
| Transform | trim、percent-encode、json-stringify、raw、lowercase 等 | modifiers、defaultTransform |
| Execute | 把 resolved variables 应用到 URL、snippet、prompt、translation payload | actionId、featureId、traceId |
| Evidence | 展示 provider、permission、input source、latency、fallback/failure | user-visible chips + logs |
| Expire | context/clipboard/selection 不跨 session 默认持久化 | retention、redaction |

### 4.3 类型

| 类型 | 用途 | v1 支持 |
| --- | --- | --- |
| `text` | 普通文本、Prompt、翻译源文本 | 是 |
| `url` | Quicklink URL 或裸域名 | 是 |
| `number` | 计算、限制、计数 | 是，但不做复杂数字格式 |
| `boolean` | 开关参数 | 是 |
| `select` | 目标语言、搜索引擎、浏览器 | 是，最多本地 options |
| `secretRef` | Provider key / API token 引用 | 只读 health/ref，不展开 |
| `filePath` | 单文件路径 | 后置，只读动作先做 |
| `fileList` | 多文件路径 | 后置，写入二次确认 |
| `imageRef` | 图片 data URL 或 temp ref | 后置到 translation/image，避免普通 resolver 长期持有大 base64 |
| `html` | 富文本 | 后置，先做 text/raw 双通道设计 |
| `json` | Flow / workflow payload | 后置，不进 snippets/quicklinks v1 |

### 4.4 默认值与校验

| 能力 | 默认值策略 | 校验策略 |
| --- | --- | --- |
| Quicklinks | `{argument default="..."}` 或 plugin storage 默认参数；URL 场景默认 percent encode | required、url template 必须有 http/file/app scheme allowlist、max length |
| Snippets | runtime date/time/uuid 默认可生成；clipboard 无内容则 warning | placeholder 未解析、clipboard permission missing、cursor 多个占位符 |
| Translation | `sourceLang=auto`、`targetLang=lastUsed/default` | text 非空、image OCR 非空、provider health 可用 |
| AI Commands | prompt template 可有 default tone/language；selected text 优先于 clipboard | prompt 非空、selection missing、provider/model/capability available |
| Flow payload | 不自动默认；由 sender 明确提供 | payload type、size limit、target supportedTypes |

### 4.5 隐私等级

| 等级 | 数据 | 展示与存储规则 |
| --- | --- | --- |
| `public` | date/time/uuid、固定 literal、公开 quicklink title | 可完整显示和记录 |
| `local` | 用户输入 query、参数默认值、搜索引擎 id | 可显示 preview，日志限制长度 |
| `context` | selected text、clipboard text、current item title/path | UI 显示 source 和 preview，run log 脱敏或截断 |
| `sensitive` | file paths、image data、html raw、browser data、OCR text | 默认只存 ref/长度/hash/preview，不落普通 JSON |
| `secret` | provider API key、token、credential | 只传 `secretRef` 和 health，禁止 placeholder 展开明文 |

### 4.6 展示方式

| 展示位置 | 必须显示 |
| --- | --- |
| CoreBox item subtitle | 输入来源、缺参提示、provider/capability 状态 |
| Action Panel | 参数字段、默认值、required/invalid reason、执行后 evidence |
| OmniPanel | selected text support level、selection issue code、动作可用性 |
| Translation widget | source text/image source、provider、model、latency、trace/failure |
| Plugin logs / run trace | featureId、actionId、variable names、redacted preview、failure code |

### 4.7 失败态

| 失败码 | 场景 | 用户语义 |
| --- | --- | --- |
| `VARIABLE_MISSING` | required argument/selection/clipboard 缺失 | 需要填写或复制内容后重试 |
| `VARIABLE_INVALID` | 类型、长度、pattern、URL 校验失败 | 参数格式不符合要求 |
| `PERMISSION_MISSING` | clipboard/window/fs/network/intelligence 权限缺失 | 授权后可继续 |
| `SOURCE_UNAVAILABLE` | selected text 捕获失败、clipboard empty、browser-tab unavailable | 当前上下文没有可用输入 |
| `SOURCE_UNSUPPORTED` | 平台或输入类型不支持 | 当前平台/能力不支持 |
| `PROVIDER_DEGRADED` | AI/OCR/translation provider 降级 | 可继续但质量或路径受限 |
| `SECRET_UNAVAILABLE` | secure store 或 provider key 不可用 | 需要配置或修复 secret storage |
| `ENCODE_FAILED` | URL/JSON/HTML 转换失败 | 参数不能安全用于目标格式 |
| `EXECUTION_BLOCKED` | 安全检查或二次确认拒绝 | 未执行副作用 |

## 5. 最小 Contract v1

### 5.1 设计原则

1. **薄解析器，不建新平台**：只负责变量解析、校验、转换和 evidence，不接管插件执行生命周期。
2. **兼容旧语法**：`touch-snippets` 继续支持 `{{date}}` / `{{time}}` / `{{uuid}}` / `{{clipboard}}`。
3. **新增统一语法**：新能力优先用 `{date}`、`{argument name="q" default="..."}`、`{selection | trim}`。
4. **默认安全转换**：Quicklink URL 默认 percent encode；AI prompt 默认保留 source boundary；Snippet 默认 raw text。
5. **隐私可见**：clipboard、selection、files、image、html 都必须在 UI 或 evidence 中标明来源。
6. **失败不伪装成功**：缺参、无权限、provider 不可用时返回 blocked/failed reason，不替换为空字符串后继续执行。

### 5.2 类型草案

```ts
type TuffVariableSource =
  | 'query.text'
  | 'query.input'
  | 'selection.text'
  | 'clipboard.text'
  | 'clipboard.image'
  | 'item.meta'
  | 'flow.payload'
  | 'runtime.date'
  | 'runtime.time'
  | 'runtime.uuid'
  | 'runtime.calculator'
  | 'config.value'
  | 'secret.ref'
  | 'literal'

type TuffVariableType =
  | 'text'
  | 'url'
  | 'number'
  | 'boolean'
  | 'select'
  | 'secretRef'
  | 'filePath'
  | 'fileList'
  | 'imageRef'
  | 'html'
  | 'json'

type TuffVariablePrivacy = 'public' | 'local' | 'context' | 'sensitive' | 'secret'

interface TuffVariableSpec {
  name: string
  label?: string
  type: TuffVariableType
  source: TuffVariableSource
  required?: boolean
  defaultValue?: string | number | boolean
  options?: Array<{ label: string; value: string }>
  privacy?: TuffVariablePrivacy
  validation?: {
    minLength?: number
    maxLength?: number
    pattern?: string
    urlSchemes?: string[]
  }
  modifiers?: Array<'trim' | 'uppercase' | 'lowercase' | 'percent-encode' | 'json-stringify' | 'raw'>
  evidenceLabel?: string
}

interface TuffVariableContext {
  query?: TuffQuery
  selection?: {
    text?: string
    source?: string
    supportLevel?: 'supported' | 'best_effort' | 'unsupported'
    issueCode?: string
  }
  clipboard?: {
    text?: string
    imageRef?: string
    hasPermission?: boolean
  }
  item?: TuffItem
  flow?: FlowPayload
  config?: Record<string, unknown>
  now?: Date
}

interface TuffVariableResolution {
  ok: boolean
  values: Record<string, string | number | boolean>
  evidence: Array<{
    name: string
    source: TuffVariableSource
    privacy: TuffVariablePrivacy
    status: 'resolved' | 'missing' | 'invalid' | 'blocked' | 'unsupported'
    preview?: string
    reason?: string
  }>
}
```

### 5.3 语法范围

| 语法 | v1 处理 | 说明 |
| --- | --- | --- |
| `{{date}}` / `{date}` | 支持 | Snippet 旧语法与新语法都映射到 runtime.date |
| `{{time}}` / `{time}` | 支持 | runtime.time |
| `{{uuid}}` / `{uuid}` | 支持 | runtime.uuid |
| `{{clipboard}}` / `{clipboard}` | 支持文本 | 需要 clipboard source evidence |
| `{selection}` | 支持文本 | 来自 OmniPanel selected text 或显式 context |
| `{argument}` | 支持 | 未命名参数默认 `argument` |
| `{argument name="q" default="hello" options="a,b"}` | 支持 | options 首版只做逗号分隔字符串 |
| `{calculator}` | 后置可支持 | 复用 PreviewSDK，首版可先只定义 source |
| `{browser-tab}` | 不进 v1 | 需要浏览器扩展和页面隐私边界 |
| `{snippet name="..."}` | 不进 v1 | 避免 snippet 递归和循环依赖 |
| `{clipboard offset=1}` | 不进 v1 | 需要 Clipboard History retention 与隐私 UI |

### 5.4 四个首批落点

| 落点 | v1 行为 | 不做 |
| --- | --- | --- |
| `touch-snippets` | 保持旧 placeholder；改为共享 resolver；clipboard missing 显示 reason | 不做系统级 hot string/autopaste/cursor |
| Quicklinks / `touch-browser-open` | manual quicklink 用 URL template + `TuffVariableSpec[]`；URL 默认 encode | 不写回浏览器书签，不做云同步 |
| `touch-translation` | `translate {selection}`、`translate {argument name="text"}`、clipboard image 输入进入同一 evidence | 不扩成聚合 provider 大改 |
| AI Commands / OmniPanel | 内置 AI action template 使用 `{selection}` / `{argument}`；provider/model/trace 进 evidence | 不做完整 Raycast AI Extension 或自定义 command 市场 |

### 5.5 SDK 表达方式

Manifest 后续可加可选字段，不影响现有插件：

```ts
interface IPluginFeature {
  parameters?: TuffVariableSpec[]
  parameterTemplate?: {
    syntax: 'tuff-v1'
    body: string
    output: 'text' | 'url' | 'prompt' | 'json'
  }
}
```

插件端新增 helper，而不是要求每个插件自己 parse：

```ts
const result = await plugin.variables.resolve({
  template: 'https://translate.google.com/?text={argument name="text"}',
  parameters: [
    { name: 'text', type: 'text', source: 'selection.text', required: true, privacy: 'context' },
  ],
  context: query,
})
```

首版也可以只在 `packages/utils` 提供纯函数，不立刻开放 runtime SDK：

```ts
resolveTuffVariables(template, specs, context)
```

## 6. 能力映射表

| 竞品能力 | Tuff 当前路径 | 统一变量合同后的状态 | 最小 evidence |
| --- | --- | --- | --- |
| Raycast Quicklinks `{argument}` | `touch-browser-open` search engine URL builder | manual quicklink 可声明 required/default/options；URL 默认 encode | Google/Bing/Translate 三个 URL template 样本 |
| Raycast Snippets `{date}` / `{clipboard}` | `touch-snippets.applyPlaceholders()` | 旧 `{{}}` 与新 `{}` 共享 resolver | date/time/uuid/clipboard 权限和 missing 测试 |
| Raycast AI Commands `{selection}` | OmniPanel selected text + `touch-intelligence` prompt | AI template 可声明 selection/query/clipboard 优先级 | selected text summarize/translate/rewrite 三条样本 |
| Raycast `{calculator}` | PreviewSDK / PreviewProvider | 后置接入 runtime.calculator，不写第二套计算核心 | `2+2`、`1m to cm` 作为变量值 |
| Alfred `{query}` / `arg` | `TuffQuery.text` / item meta payload | 明确 query.text 是主动输入，item/action payload 是下游参数 | Script-like feature item 选择后 action payload 不丢 |
| Alfred workflow variables | Intelligence workflow inputSources / Flow context / plugin storage | v1 只定义 `vars` 命名空间，不做节点图 | one-run vars redaction 样本 |
| Alfred Workflow Configuration | plugin storage / secret SDK | config.value 与 secret.ref 分开 | provider key 不进 run log |
| uTools regex/over 指令 | `commands` + `acceptedInputTypes` | 参数 validation 支持 pattern/min/max/exclude 后置 | URL/text over 匹配不污染短查询 |
| uTools img/files/window | `TuffQuery.inputs` + OmniPanel/Context Actions | image/files 可作为变量源；window 只做弱信号 | image translate、files read-only、window unsupported |
| uTools dynamic feature | push feature / plugin storage | manual quicklinks 生成动态 item/feature，但不绕过 permission | storage quicklink create/update/delete 样本 |
| Flow payload | `FlowPayload.type/data/context.originalQuery` | 可作为 `flow.payload` source，不替代 CoreBox query | text/files/html target supportedTypes 样本 |
| Intelligence workflow payload | workflow contextSources/inputSources/steps | AI 内部继续使用，不拖大 v1 resolver | Use Model inputSources 仍保留 run trace |

## 7. 迁移风险

| 风险 | 影响 | 规避 |
| --- | --- | --- |
| 旧 snippets 语法破坏 | 用户已有 `{{date}}` 等片段失效 | v1 必须兼容 `{{}}`；新增 `{}` 只作为可选 |
| clipboard 无权限被替换为空 | 结果看似成功但缺内容 | `VARIABLE_MISSING` / `PERMISSION_MISSING` 阻断或明确 warning |
| URL 未编码或重复编码 | Quicklink 打开错误、参数注入 | URL output 默认 `percent-encode`；显式 `raw` 才跳过 |
| selected text 捕获不稳定 | AI/翻译命令时好时坏 | OmniPanel `selectionSupportLevel` / `issueCode` 必须进入 evidence |
| 大图片/base64 进入普通 JSON | 存储膨胀、隐私风险 | image 只传 ref/hash/preview；短期 data URL 只在执行内存中使用 |
| secret 被当变量展开 | API key 泄漏 | `secretRef` 不能输出明文，只显示 health/ref |
| AI workflow 复杂度外溢 | 为 snippets/quicklinks 引入过重依赖 | v1 resolver 独立于 Intelligence workflow；只共享 source/evidence 思路 |
| 动态 Quicklink 污染 CoreBox 排序 | 用户配置过多导致搜索噪声 | manual quicklinks 需要 enabled/tags/pinned/usage score 和 limit |
| regex/over 过宽匹配 | 任意文本都触发插件，体验变差 | 默认 minLength、exclude、priority lower，显示 matched rule |
| 多插件重复实现 resolver | 行为漂移、测试困难 | 统一放在 `packages/utils` 纯函数，插件只调用 |

## 8. 测试与 evidence 样本

| 样本 | 输入 | 期望 |
| --- | --- | --- |
| `snippets-placeholder-v1` | snippet: `今天是 {{date}}，剪贴板：{{clipboard}}` | date resolved；clipboard 有权限时替换；无权限显示 `PERMISSION_MISSING` |
| `snippets-new-syntax-v1` | snippet: `ID {uuid}` | 新旧语法 resolver 一致 |
| `quicklink-argument-required` | URL: `https://www.google.com/search?q={argument name="q"}`，未填 q | item 显示 required 参数，不执行 |
| `quicklink-url-encode` | q = `hello world & tuff` | URL 中参数 percent encoded |
| `quicklink-raw-optout` | `{argument name="url" | raw}` | 只有显式 raw 才不 encode，并通过 scheme allowlist |
| `translation-selection` | OmniPanel selected text = `hello` | 翻译 action 使用 source=`selection.text`，provider/latency/trace 可见 |
| `translation-empty-image` | feature 接收 image 但 clipboard 无图片 | 返回 `SOURCE_UNAVAILABLE`，不打开空窗口 |
| `ai-command-selection` | prompt template: `Summarize {selection}` | selected text 缺失时显示 `VARIABLE_MISSING` |
| `ai-command-argument-options` | `{argument name="tone" options="formal,casual"}` | 参数 UI 限定 options，值进入 prompt evidence |
| `flow-payload-source` | Flow payload type=text + originalQuery | resolver 可读取 `flow.payload` preview，但 logs redacted |
| `secret-ref-block` | template 引用 `{secret name="apiKey"}` | v1 拒绝明文展开，只允许 `secret.ref` health |
| `stale-result-guard` | 输入变化触发两次 resolve | 旧 resolve 不覆盖新输入结果 |

建议 focused 验证入口：

| 层级 | 建议验证 |
| --- | --- |
| Pure utils | `resolveTuffVariables()` 单测覆盖 syntax、modifiers、validation、privacy evidence |
| Plugin fixtures | `touch-snippets` 旧 placeholder fixtures；`touch-browser-open` manual quicklink fixtures |
| Renderer contract | 参数输入态 required/default/options、错误展示、Action Panel evidence |
| Integration | selected text -> translation；clipboard image -> screenshot translate；AI command -> provider failed |
| Docs evidence | 每个样本记录 input source、resolved values preview、permission/provider/failure reason |

## 9. 最小落地切片

| 切片 | 范围 | 验收 | 不做 |
| --- | --- | --- | --- |
| `variable-contract-v1-doc` | 本文 contract + SDK 类型草案 | 评审通过后进入 TODO/CHANGES | 不改 runtime |
| `variable-resolver-pure-v1` | `packages/utils` 纯 resolver，支持 text/date/time/uuid/clipboard/selection/argument/modifiers | focused unit 全通过 | 不接 UI，不接 browser-tab |
| `snippets-resolver-adoption` | `touch-snippets` 使用 resolver，兼容 `{{}}` | 旧 fixtures 不变；新增 missing clipboard evidence | 不做 hot string/autopaste |
| `quicklink-template-v1` | `touch-browser-open` 增 manual quicklink schema + URL template | Google/Bing/Translate 样本；URL encode 测试 | 不做浏览器历史/云同步 |
| `translation-variable-v1` | `touch-translation` 将 query/selection/image source 统一进 evidence | selected text、typed text、clipboard image 三样本 | 不改 provider 大架构 |
| `ai-command-template-v1` | OmniPanel 内置 AI action template 化 | summarize/translate/rewrite/code review 可见 template/evidence | 不做完整 AI Command 市场 |

## 10. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只做任务 6/10 参数填充专项 | 通过 | 输出限定到本文件，不改代码、不改 TODO/CHANGES |
| 2 | 基线 review：对齐 01 基础能力、03 Alfred、04 uTools 文档 | 发现参数统一已在前文多次出现但未独立成 contract | 本文聚焦 `TuffVariableContract v1` |
| 3 | 竞品事实 enforce：优先官方来源 | 通过 | 使用 Raycast Manual、Alfred Help、uTools 开发者文档作为来源 |
| 4 | Tuff 证据 review：不把规划当实现 | 通过 live tree 扫描 | 以 `TuffQuery`、`IPluginFeature`、具体插件和 shared events/types 为准 |
| 5 | KISS/YAGNI review：是否提出大框架 | 初稿倾向 workflow 化 | 收敛为纯 resolver + 四个首批落点 |
| 6 | 隐私 enforce：clipboard/selection/files/image/secret 是否区分 | 通过 | 新增 privacy 等级、redaction 和 secretRef 规则 |
| 7 | 失败态 review：是否存在空字符串伪成功 | 发现 snippets clipboard 与 translation empty image 是高风险口径 | 新增 `VARIABLE_MISSING` / `SOURCE_UNAVAILABLE` 等失败码 |
| 8 | SDK review：是否破坏旧插件 | 通过 | `parameters` 为可选字段；旧 `onFeatureTriggered` 不变 |
| 9 | 测试 review：是否可验证 | 通过 | 补 pure utils、plugin fixtures、renderer contract、integration、docs evidence 样本 |
| 10 | 文档完整性 review：是否覆盖六项分析要求 | 通过 | 补竞品横向、Tuff 对照、统一模型、contract v1、映射表、风险和来源 |

## 11. 引用来源

### Raycast

- Raycast Manual - Dynamic Placeholders: https://manual.raycast.com/dynamic-placeholders
- Raycast Manual - Quicklinks: https://manual.raycast.com/quicklinks
- Raycast Manual - Snippets: https://manual.raycast.com/snippets
- Raycast Manual - AI Commands: https://manual.raycast.com/ai/ai-commands
- Raycast Changelog - Dynamic Placeholders in Quicklinks: https://www.raycast.com/changelog/macos/1-76-0

### Alfred

- Alfred Help - Using Variables in Workflows: https://www.alfredapp.com/help/workflows/advanced/variables/
- Alfred Help - Workflow Configuration: https://www.alfredapp.com/help/workflows/workflow-configuration/
- Alfred Help - Script Filter Input: https://www.alfredapp.com/help/workflows/inputs/script-filter/
- Alfred Help - Script Filter JSON Format: https://www.alfredapp.com/help/workflows/inputs/script-filter/json/
- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/

### uTools

- uTools 开发者文档 - plugin.json 核心配置文件说明: https://www.u-tools.cn/docs/developer/information/plugin-json.html
- uTools 开发者文档 - 动态指令: https://www.u-tools.cn/docs/developer/api-reference/utools/features.html
- uTools 开发者文档 - 基础文档: https://www.u-tools.cn/docs/developer/docs.html
- uTools 开发者文档 - 认识 preload: https://www.u-tools.cn/docs/developer/information/preload.html
