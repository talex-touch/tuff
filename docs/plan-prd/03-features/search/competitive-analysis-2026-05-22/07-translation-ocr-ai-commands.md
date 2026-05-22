# 快速翻译、OCR 与 AI 命令专项

> 日期：2026-05-22
> 范围：Raycast AI / Translate / AI Commands，Alfred workflows 翻译 / OCR / AI 扩展模式，uTools 快速翻译 / 聚合翻译 / OCR / AI 插件应用；对照 Tuff 当前 `touch-translation`、OCR service、图片翻译、OmniPanel Writing Tools、CoreBox AI Ask、Intelligence SDK / workflow、provider health 与 secret storage。
> 约束：只输出竞品分析与最小实施切片；不改代码，不新增递归执行命令，不把源码存在等同于 packaged 体验闭环。

## 1. 结论

翻译、OCR 与 AI 命令不是三个独立功能，而是同一条“输入来源 -> 参数化命令 -> provider 执行 -> 可见结果 -> 可恢复失败”的桌面效率链路。Raycast、Alfred、uTools 的共同模式是：

1. **输入来源多样但要显式**：typed query、selected text、clipboard text、clipboard image、screenshot、file image、manual parameter 都可以触发翻译 / OCR / AI，但用户需要知道当前用了哪个来源。
2. **命令模板比聊天更关键**：Raycast AI Commands、Alfred Workflows、uTools 功能指令都把“翻译成某语言 / 改写 / 总结 / OCR 后处理”做成可复用命令，而不是每次从空聊天开始。
3. **Provider health 与 secret 是体验的一部分**：无密钥、权限拒绝、模型不支持、OCR 失败、网络失败不能被包装成空结果；失败需要显示 provider、capability、trace、latency、credential/secure-store 状态与下一步。
4. **隐私边界要前置**：OCR 图片、剪贴板内容、选中文本和 AI prompt 都可能敏感；Tuff 必须坚持“敏感内容不落盘、落盘只存 hash/截断/引用、secret 不进普通 JSON / localStorage / 日志”。

Tuff 当前不是零基础：

| 能力 | 当前事实 | 判断 |
| --- | --- | --- |
| 文本快速翻译 | `touch-translation` 提供 `touch-translate` / `multi-source-translate`，命令含 `fy` / `translate` / `翻译` / `fy-multi`，支持 Google 与 Tuff Intelligence provider | 已有最小路径，但缺统一 input source / provider evidence |
| 截图 / 图片翻译 | `screenshot-translate` 支持 `text/image` 输入；`image.translate.e2e` 与 `corebox.screenshot.translate` 已接入；`image-translate.ts` 可处理 CoreBox image item 与当前剪贴板图片 | 代码路径存在，仍缺 packaged Electron 剪贴板图片、截图权限、fallback 样本 |
| OCR service | `ocr-service.ts` 有 SQLite job/result、worker path、最大图片 8 MiB、最大文本 / raw 截断、失败窗口、重试退避、queue disable | 后台 OCR 基础扎实，但还不是用户可感知 OCR 命令体验 |
| CoreBox AI Ask | `touch-intelligence` 支持 typed text、剪贴板图片 OCR + `text.chat`、handoff session、provider/model/trace/latency metadata | 已有可用雏形，缺用户自定义 AI Command 模板与 packaged answer/failure evidence |
| OmniPanel Writing Tools | translate / summarize / rewrite / explain / review 映射到 Intelligence capability，metadata 不带 raw context | selected text 路径清晰，但与 CoreBox / 插件命令模板尚未统一 |
| Provider / secret | `usePluginSecret()`、CoreApp secure-store safeStorage-first、Nexus Provider Registry health / scene strategy 已有 | 仍需 Credential Locker / libsecret 与端到端 provider health 可见证据 |

因此最小下一步不是重做 AI 或 OCR，而是建立 **Translation/OCR/AI Command Contract v1**：

| 合同 | 目标 | 首批落点 |
| --- | --- | --- |
| `InputSourceEnvelope` | 统一记录 typed query、selected text、clipboard image、screenshot、file image、manual parameter 来源与敏感性 | `touch-translation`、`touch-intelligence`、OmniPanel AI actions |
| `AiCommandTemplate` | 把内置写作/翻译/问答能力沉淀为可执行模板，支持参数和来源变量 | CoreBox AI Ask + OmniPanel Writing Tools |
| `ProviderEvidence` | 每次结果或失败都展示 capability/provider/model/latency/trace/health/secret 状态 | Translation widget、AI Ask item、image translate pin window |
| `PrivacyRedactionPolicy` | run record 与日志只保留 hash、长度、截断 preview、secret ref，不落原图/全文/密钥 | OCR service、Intelligence run metadata、Nexus scene usage |

## 2. 竞品模式拆解

### 2.1 Raycast：Translate + AI Commands + Dynamic Placeholders

Raycast 的关键不是单独的翻译窗口，而是把翻译、AI Commands、Dynamic Placeholders 和 Search Bar 连接起来：

| 能力 | Raycast 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| Translate | 支持打开 Translate 后输入 / 粘贴，支持 source / target language、copy、swap、继续用 AI Chat 等动作 | Tuff `touch-translation` 已有 widget，但应把 source/target/provider/trace 作为稳定 evidence |
| Inline translation | 可在 Search Bar 中直接用自然语言触发翻译，例如“hello in german”一类输入 | Tuff 首版不必做全自然语言，先支持 `translate {text} to {language}` / `fy {text}` 模板 |
| Selected text | Translate / AI Command 可以把前台选中文本作为输入 | Tuff OmniPanel 已有 selected text，需进入统一 Context Actions / AI Command 模板 |
| AI Commands | 用户可创建自定义 AI Command，设置 prompt、model、creativity、arguments、selected text 等变量 | Tuff 应先把内置 translate/summarize/rewrite/review 变成 `AiCommandTemplate`，再开放管理 |
| Dynamic Placeholders | `{selection}`、`{clipboard}`、`{argument}`、date/time/uuid/calculator 等在 Quicklinks / Snippets / AI Commands 中复用 | Tuff 不要写多套模板引擎；Translation / Snippets / Quicklinks / AI Command 共用参数 resolver |
| Store extensions | Store 里有 DeepL、Google Translate、OCR、image / text 处理等扩展方向 | Tuff Store 应展示 input types、permissions、provider health，而不只展示插件名 |

Raycast 的产品心智是：用户不区分“翻译插件、AI 插件、命令参数、选中文本动作”，而是从当前输入直接得到可执行动作。Tuff 当前能力分散，缺的是统一合同。

### 2.2 Alfred：Workflow 把翻译 / OCR / AI 做成对象流

Alfred 没有把 AI 统一塞进主产品，而是通过 Workflows / Gallery / Automation Tasks 把扩展能力变成可安装、可调试、可配置的对象流。

| 能力 | Alfred 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| Keyword / Script Filter | 输入关键词后 workflow 返回动态结果，JSON item 可带 title、subtitle、arg、variables、mods 等 | Tuff Prelude `onFeatureTriggered` 可对齐，但需要 run record、取消、错误、provider evidence |
| Universal Actions | 对文本、URL、文件等上下文展示可用动作，workflow 可扩展动作列表 | Tuff `acceptedInputTypes` / `TuffQuery.inputs` 应统一为 Context Actions |
| OCR Automation Tasks | Workflow 可用官方 Automation Tasks 处理 OCR、图像、文件等任务 | Tuff `ocr-service` 有后台能力，但需要暴露为可组合 AI/OCR command step |
| AI / Translate workflows | Gallery 有 ChatGPT / DALL-E / DeepL Translate / OCR 等 workflow 示例 | Tuff 不应直接开放裸 shell；先提供 typed `text.translate`、`vision.ocr`、`text.chat`、`clipboard.write` action |
| Workflow Configuration | API key、语言、选项可由用户安装后配置 | Tuff 应复用 `usePluginSecret()` 和 settings schema，secret 不写 manifest / 普通 storage |
| Debugger | 每一步输入、输出、变量、错误可看 | Tuff 需要把 provider trace、failure reason、redaction 变成用户和开发者都能看的 evidence |

Alfred 给 Tuff 的重点启发是 **可调试对象流**：OCR 后翻译、翻译后改写、selected text -> AI command -> clipboard output 都应有 step trace，而不是插件内部黑盒。

### 2.3 uTools：功能指令 + 超级面板 + 聚合插件

uTools 把快速翻译、聚合翻译、OCR、AI 插件放在“功能指令 + 超级面板 + 插件市场”的用户心智里。其官方帮助中心说明功能指令会按文本、图片、文件路径、截图等不同数据源触发插件推荐；超级面板则面向选中文本、图片、文件、文件夹等上下文展示功能选项。

| 能力 | uTools 行为 | 对 Tuff 的启发 |
| --- | --- | --- |
| 快速翻译 / 聚合翻译 | 输入指令或选中文本后调用翻译插件，可同时对比多个 provider | Tuff `multi-source-translate` 已对齐，但 provider 失败需要逐项展示，不应整体失败 |
| OCR 文字识别 | 截图或图片触发 OCR 插件，结果可复制 / 后处理 | Tuff `vision.ocr` 与 OCR queue 需要前台入口和失败态 |
| AI 插件应用 | 市场中 AI 插件可面向写作、翻译、总结、问答 | Tuff 先做 AI command template，不先做 AI 生成插件闭环 |
| 超级面板 | 对 selected text / image / files 自动匹配可用动作 | Tuff 不复制鼠标面板；映射为 CoreBox / MetaOverlay / Assistant 的 `ContextActionProvider` |
| 市场发现 | 用户按场景安装工具 | Nexus Store 应展示“可处理 text/image/files/screenshot”“需要 network/intelligence/window 权限” |

uTools 的优势是低门槛，但 Tuff 应保留更强的 sdkapi hard-cut、typed SDK、permission reason 和 secret store 约束。

## 3. Tuff 当前能力快照

| 能力域 | 当前状态 | 证据路径 | 判断 |
| --- | --- | --- | --- |
| `touch-translation` manifest | 已声明文本翻译、多源翻译、截图翻译；权限包含 `clipboard.read`、`network.internet`、`intelligence.basic`、`storage.plugin`、`window.create`；截图翻译支持 `acceptedInputTypes: ["text", "image"]` | `plugins/touch-translation/manifest.json` | 产品入口存在，需补输入来源和 packaged evidence |
| 文本翻译执行 | `onFeatureTriggered` 提取 typed text；空输入显示 idle / no input；provider 按配置并行执行；Tuff Intelligence provider 需要 `intelligence.basic`，Google provider 需要 `network.internet` | `plugins/touch-translation/index/main.ts` | 已具备最小文本翻译链路 |
| 图片翻译执行 | `screenshot-translate` 若收到 clipboard image data URL，调用 `image.translate.e2e`，结果用 DivisionBox 或 CoreBox item 展示，包含 provider/model/traceId | `plugins/touch-translation/index/main.ts` | 路径存在，仍缺真实剪贴板图片 / 截图权限 evidence |
| OCR fallback | screenshot feature 没有 image 时可走 `vision.ocr` 从 image data URL 提取文本，再进入文本翻译 | `plugins/touch-translation/index/main.ts` | OCR 失败已有错误归一化，但用户可恢复动作不足 |
| Translation provider config | UI 支持 Google / DeepL / Bing / Custom / Baidu / Tencent / MyMemory / Tuff Intelligence；secret 字段迁入 `usePluginSecret()`；普通 config 剥离 apiKey/secretKey/token | `plugins/touch-translation/src/composables/useTranslationProvider.ts`、`ProviderConfigModal.vue` | secret 规则正确，需补遗留清理与 degraded evidence |
| Secret health | `ProviderConfigModal` 调 `secret.health()`，区分 unavailable / degraded / available；CoreApp secure-store 优先 Electron `safeStorage`，不可用降级 `local-secret` | `packages/utils/plugin/sdk/secret.ts`、`apps/core-app/src/main/utils/secure-store.ts` | 仍缺 Windows Credential Locker / Linux libsecret / Secret Service |
| OCR service | job queue、worker OCR、SQLite results、payload hash、最大图片 8 MiB、文本 / raw / blocks 截断、失败窗口、retry delay、queue disable、dashboard event | `apps/core-app/src/main/modules/ocr/ocr-service.ts` | 后台能力扎实，前台命令化与隐私 evidence 需补 |
| CoreBox image translate | 可从 image item 或当前剪贴板图片读取 base64，调用 `corebox.screenshot.translate`，成功时写剪贴板或打开 pin window | `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts` | 已接 image item / clipboard image，但 empty / scene unavailable evidence 需补 |
| CoreBox AI Ask | `touch-intelligence` 支持 `@ai` / `/ai` / `智能` / `问答` 前缀；文本输入走 `text.chat`；剪贴板图片先 `vision.ocr` 再 `text.chat`；结果含 provider/model/trace/latency/handoffSessionId | `plugins/touch-intelligence/index.js` | 可用雏形，缺用户自定义 AI Command 模板 |
| OmniPanel Writing Tools | `builtin.ai.translate/summarize/rewrite/explain/review` 映射 `text.translate`、`text.summarize`、`text.rewrite`、`code.explain`、`code.review`；metadata 只存 source/capsule summary，不带 raw context | `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts` | selected text 路径清晰，应与 CoreBox AI Commands 统一 |
| Intelligence SDK | capability registry 包含 `text.translate`、`vision.ocr`、`image.translate.e2e`；SDK 暴露 `text.translate()`、`vision.ocr()`、`image.translateE2e()` | `apps/core-app/src/main/modules/ai/intelligence-module.ts`、`intelligence-sdk.ts` | 能力面足够，缺模板与 provider evidence 的产品化 |
| Nexus provider health | Scene orchestrator 支持 least cost / lowest latency 等策略，latest provider health 可参与选择 | `apps/nexus/server/utils/sceneOrchestrator.test.ts` | 后端能力已有，CoreBox 结果侧仍需可见化 |
| Result signal | Renderer 已有 provider unavailable、credentials missing、secure-store degraded、permission denied、quota/rate limit 等 signal label/action hint | `apps/core-app/src/renderer/src/components/render/sourceMeta.ts` | 可复用到翻译/OCR/AI item，但需要统一写入 meta |

## 4. 输入来源矩阵

| 输入来源 | Raycast | Alfred | uTools | Tuff 当前状态 | 风险 | 最小建议 |
| --- | --- | --- | --- | --- | --- | --- |
| `typed query` | Search Bar inline translation、AI Command arguments | Keyword / Script Filter | 功能指令 | `touch-translation`、`touch-intelligence`、Preview / plugin command 已支持 | 短文本、命令前缀、自然语言意图混淆 | 首版只支持显式 `fy` / `translate` / `ai` / command template，不做全自然抢占 |
| `selected text` | Translate / AI Commands 可用 selection | Universal Actions | 超级面板文本数据源 | OmniPanel 已能解析 selected text；CoreBox Context Actions 未统一 | 隐式抓取隐私、权限不透明 | 只在用户主动触发 OmniPanel / Context Action 时读取，并标注 `inputSource: selected-text` |
| `clipboard text` | Dynamic Placeholder / Clipboard History / AI Command | Clipboard trigger / workflow input | 剪贴板插件 / 功能推荐 | `touch-translation` manifest 需要 clipboard.read；TuffQuery 支持 text input | 剪贴板内容敏感，空剪贴板误判 | 只读当前输入快照，结果 item 显示来源和长度，不把全文写 trace |
| `clipboard image` | 可由 extension / AI 处理 | Universal Action / workflow input | 图片匹配 / OCR 插件 | `touch-translation` screenshot、CoreBox `translateClipboardImage`、Assistant VoicePanel 已复用 | 大 base64、空图片、provider 不支持 vision | 图片只做临时 payload；run record 存 hash/size/mime，不落原图 |
| `screenshot` | Translate / OCR / extension 可处理截图 | OCR workflow / Automation Task | 截图触发 OCR | `screenshot-translate` 是实验能力，scene 为 `corebox.screenshot.translate` | 屏幕录制权限、截图失败、Linux/Wayland 差异 | `window.capture` 权限拒绝必须 fail-closed；packaged evidence 必须覆盖权限拒绝 |
| `file image` | extension 可从文件动作处理图片 | File Action / Universal Action | 文件 / 文件夹数据源 | `ocr-service` 支持 file path，`image-translate.ts` 可从 local file URL / path 读取 image item | 路径权限、文件过大、watch root 外泄 | file image 只传 path/ref + hash；超过 8 MiB 显示 blocked reason |
| `browser tab future` | AI Commands / placeholders 可接 browser tab 语境 | Workflow 可由脚本获取浏览器上下文 | 插件生态可扩展 | Tuff 目前 browser data 首版偏 bookmarks；AI action capsule 可承载 desktop context summary | 浏览器标签和网页内容高度敏感 | 后置；只做显式授权的 tab title/url/selection，不默认读网页全文 |
| `manual parameter` | AI Command argument / Quicklink argument | Workflow Configuration / variables | 插件设置 / 功能指令参数 | Tuff 还缺统一 `parameters` / AI Command 模板 UI | 参数与 prompt 拼接造成注入 / 泄露 | `AiCommandTemplate.parameters` 先支持 text/dropdown/language/provider，不支持任意脚本 |

## 5. 竞品 -> Tuff 映射矩阵

| 场景 | 竞品行为 | Tuff 可复用路径 | 当前缺口 | 最小设计 |
| --- | --- | --- | --- | --- |
| 文本快速翻译 | Raycast inline translate；uTools 快速翻译；Alfred DeepL workflow | `touch-translation` + `text.translate` | 无统一 `translate {text} to {lang}` 参数模型；provider chips 分散 | `QuickTranslateCommand`：source text、targetLang、provider policy、inputSource、trace |
| 聚合翻译 | uTools 聚合翻译 / 多 provider 对比 | `multi-source-translate`、provider config | 多 provider 的部分失败缺统一 status/evidence | 每个 provider 独立 `pending/success/error/degraded`，整体 item 不因单 provider 失败变空 |
| 截图 OCR 翻译 | uTools OCR + 翻译；Alfred OCR workflow；Raycast extensions | `vision.ocr` + `text.translate` / `image.translate.e2e` | 截图权限、OCR 空结果、scene unavailable evidence 缺 | `ScreenshotTranslateCommand` 分 step：capture -> ocr -> translate -> overlay/pin |
| 剪贴板图片翻译 | 图片复制后触发 OCR / image translate | `translateClipboardImage()`、Assistant clipboard image translate、`screenshot-translate` image input | 空剪贴板图片、base64 归一化、provider fallback packaged evidence 缺 | `ClipboardImageTranslateCommand`：empty-image、size-limit、provider health、pin window evidence |
| AI Command 模板 | Raycast AI Commands、Alfred workflows | OmniPanel AI actions、`touch-intelligence` | 用户不能创建/管理模板；CoreBox 和 OmniPanel 不共享模板 contract | `AiCommandTemplate v1`，先内置 5 个模板，不做可视化大编辑器 |
| Selected text 写作工具 | Raycast selection placeholder、Alfred Universal Actions、uTools 超级面板 | OmniPanel selected text + AI actions | CoreBox / MetaOverlay 入口未统一 | `ContextActionProvider` 输出 translate/summarize/rewrite/review actions |
| OCR 后 AI 问答 | uTools OCR/AI 插件组合；Alfred object flow | `touch-intelligence` image -> `vision.ocr` -> `text.chat` | OCR 文本截断与敏感内容提示还不够显式 | result item 显示 `OCR + AI`、text length、traceId、redaction |
| Provider 策略 | Raycast settings / model choice；Alfred workflow config；uTools 插件配置 | Nexus Provider Registry scene strategy、plugin provider config | CoreBox item 不总能看到 provider health 和 secret reason | `ProviderEvidence` 写入 item meta，renderer sourceMeta 统一显示 |
| Secret 管理 | API key 安装后配置，不进公开 workflow | `usePluginSecret()`、secure-store、Nexus credential store | OS credential backend 未完整；legacy secret 清理 evidence 缺 | secret health 必须进入翻译 provider 设置和失败 item action hint |

## 6. Provider / Secret / Failure / Privacy 设计建议

### 6.1 Provider health

| 状态 | 含义 | UI / 执行语义 |
| --- | --- | --- |
| `healthy` | provider 可用，capability / model / credential 匹配 | 正常执行，显示 provider/model/latency |
| `degraded` | 可执行但 secret backend、quota、latency、fallback 或 adapter readiness 有风险 | 允许执行，但显示 warning 与下一步 |
| `unhealthy` | 最近 health check 失败或 adapter 不可用 | 默认不选，用户可重试 / 修复 |
| `unconfigured` | 缺 authRef / API key / provider config | 返回 setup required，不调用网络 |
| `unsupported` | provider 不支持 `vision.ocr` / `image.translate.e2e` / 模型能力 | 不展示为主 provider，提供切换建议 |

最小字段：

```ts
interface ProviderEvidence {
  capabilityId: 'text.translate' | 'vision.ocr' | 'image.translate.e2e' | 'text.chat' | string
  providerId?: string
  providerName?: string
  model?: string
  traceId?: string
  latencyMs?: number
  health?: 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured' | 'unsupported'
  failureCode?: string
  failureReason?: string
  fallbackUsed?: boolean
  secretHealth?: {
    backend: 'safe-storage' | 'local-secret' | 'unavailable' | string
    available: boolean
    degraded: boolean
    reason?: string
  }
}
```

### 6.2 Secret storage

必须保留当前规则：

- Provider `apiKey` / `secretKey` / `token` 只进入 `usePluginSecret()` 或 Nexus credential store。
- 普通 `providers_config` 只存 enabled、region、apiUrl、model、prompt 等非密钥元数据。
- 迁移旧 config 时，成功迁入 secret 后必须剥离普通 storage 中的 secret 字段。
- `secret.health()` 的 unavailable / degraded 必须阻止或警告 provider 保存和执行。
- CoreApp `safeStorage` 可用时优先；`local-secret` 只能是 degraded，不是最终完成态。
- 后续 Credential Locker / libsecret / Secret Service 应作为 backend closure，不改变插件 API。

### 6.3 Failure taxonomy

| 失败 | 触发条件 | UI 行为 | 不允许 |
| --- | --- | --- | --- |
| `PERMISSION_DENIED` | `clipboard.read`、`intelligence.basic`、`window.create`、`window.capture` 被拒绝 | 显示授权动作，执行返回 blocked | 静默空结果 |
| `NETWORK_UNAVAILABLE` | 翻译 provider 网络错误 / timeout | 显示 retry、provider、latency、fallback | 把错误吞成“无翻译” |
| `CREDENTIALS_MISSING` | provider 缺 key / authRef | 显示打开 provider settings | 继续请求并暴露 raw error |
| `SECURE_STORE_UNAVAILABLE` | secret backend 不可用 | 阻止保存/执行需要密钥的 provider | 把密钥退回普通 storage |
| `MODEL_UNSUPPORTED` | provider/model 不支持 vision / image translate | 建议切换模型或 provider | 伪装成 OCR 失败 |
| `OCR_EMPTY` | OCR 没识别到文字 | 允许复制原图 / 重试 / 手动输入 | 当作整体成功 |
| `IMAGE_UNAVAILABLE` | 剪贴板无图片、文件不可读、超大小 | 显示 empty/size/path reason | 打开空 pin window |
| `SCENE_UNAVAILABLE` | Nexus scene / provider registry 不可用 | 显示 scene id、capability、fallback action | 返回 fake translated image |
| `QUOTA_EXCEEDED` | AI / provider quota 不足 | 显示 quota / usage / retry later | 反复自动重试 |

### 6.4 Privacy redaction

| 数据 | 是否可落盘 | 建议 |
| --- | --- | --- |
| API key / token / secret | 不可明文落普通 JSON / localStorage / log | 只存 secure-store / credential store，run record 只存 authRef |
| clipboard text / selected text | 默认不落全文 | trace 只存 length/hash/source；UI 可以显示当前 item preview |
| clipboard image / screenshot | 不落原图 base64 | 只存 hash、mime、size、临时 ref；pin window state 不进入长期日志 |
| OCR text | 可进入本地 SQLite SoT，但需截断和 hash | 当前 OCR service 已有 max chars / textHash；UI 要标注来源 |
| AI prompt/result | 结果可由用户复制或本地 history 保存，但要有 opt-out / retention | CoreBox AI Ask 首版只保留短 history；长期 run history 需 redaction |
| provider raw response | 不落 raw 全量 | 只存 raw hash / safe snippet / error code |

## 7. 最小实施切片

### 7.1 `quick-translate-v1`

| 范围 | 内容 |
| --- | --- |
| 输入 | typed query、selected text、clipboard text |
| 命令 | `fy {text}`、`translate {text} to {language}`、OmniPanel selected text translate |
| 能力 | `text.translate` + provider fallback；多源翻译保留 provider 独立状态 |
| Evidence | inputSource、targetLang、provider/model/latency/traceId、secret health、failure code |
| 不做 | 全自然语言抢占、不做 browser tab、不做后台常驻读取 selected text |

验收样本：

1. typed query：`fy hello world` -> Tuff Intelligence / Google 至少一个 provider 成功。
2. selected text：OmniPanel translate -> `corebox.selection.translate`，metadata 不带 raw context。
3. clipboard text：显式触发后读取，空剪贴板显示 no input。
4. 无密钥 / provider disabled / network timeout 各显示独立失败。

### 7.2 `clipboard-image-ocr-translate-v1`

| 范围 | 内容 |
| --- | --- |
| 输入 | clipboard image、CoreBox image item、file image |
| 能力 | 优先 `image.translate.e2e`；fallback 可拆为 `vision.ocr` + `text.translate`；结果写剪贴板或 pin window |
| Evidence | image hash、mime、size、inputSource、sceneId、capability、provider/model/traceId、OCR text length、failure code |
| 不做 | 不保存原图 base64；不默认读全屏；不把 OCR 空结果当成功 |

验收样本：

1. 剪贴板无图片 -> `IMAGE_UNAVAILABLE`。
2. 小图片含中英文 -> pin window 展示译后图、sourceText/targetText。
3. provider scene unavailable -> `SCENE_UNAVAILABLE`，不写剪贴板。
4. 文件图片超过 8 MiB -> blocked reason。
5. packaged Electron 下真实剪贴板图片翻译截图 / 日志。

### 7.3 `ai-command-template-v1`

| 范围 | 内容 |
| --- | --- |
| 模板 | Translate、Summarize、Rewrite、Explain、Review、Ask with clipboard image |
| 参数 | `inputText`、`targetLang`、`tone`、`style`、`providerPolicy` |
| 输入来源 | selected text、typed query、clipboard text、clipboard image |
| 执行 | `text.translate` / `text.summarize` / `text.rewrite` / `code.explain` / `code.review` / `text.chat` |
| Evidence | capability/provider/model/latency/traceId、inputSource、redaction summary、handoffSessionId |
| 不做 | 不开放任意脚本、不做复杂可视化工作流、不默认上传 browser tab 内容 |

建议 schema：

```ts
interface AiCommandTemplate {
  id: string
  title: string
  capabilityId: string
  promptTemplate?: string
  inputSources: Array<'typed-query' | 'selected-text' | 'clipboard-text' | 'clipboard-image'>
  parameters?: Array<{
    name: string
    type: 'text' | 'dropdown' | 'language' | 'provider-policy'
    required?: boolean
    defaultValue?: string
    options?: Array<{ label: string; value: string }>
  }>
  privacy: {
    persistInput: false
    logRawInput: false
  }
}
```

### 7.4 `packaged-evidence-v1`

| 样本 | 必需证据 |
| --- | --- |
| 文本快速翻译 | CoreBox / OmniPanel 录屏或截图；provider/model/trace/latency；provider failure |
| 剪贴板图片翻译 | packaged Electron 下真实 clipboard image；pin window；empty clipboard；scene unavailable |
| OCR service | job dashboard / SQLite record hash；size limit；OCR empty；retry / queue disable |
| AI Command | selected text translate/summarize/rewrite；clipboard image Ask；permission denied；quota/model unsupported |
| Secret | provider secret health available/degraded/unavailable；legacy config secret 剥离样本 |

证据格式建议：

```json
{
  "scenario": "clipboard-image-translate",
  "surface": "corebox",
  "inputSource": "clipboard-image",
  "capabilityId": "image.translate.e2e",
  "status": "completed",
  "provider": "tuff-nexus-default",
  "model": "tencent-cloud:image.translate.e2e",
  "traceId": "trace_xxx",
  "latencyMs": 1234,
  "redaction": {
    "rawInputPersisted": false,
    "inputHash": "sha256:...",
    "imageBytes": 102400
  }
}
```

## 8. 优先级

| 优先级 | 切片 | 验收 |
| --- | --- | --- |
| P0 | 文本快速翻译 evidence | typed query / selected text / clipboard text 三源可跑；provider failure 可见 |
| P0 | 剪贴板图片 OCR 翻译 evidence | empty clipboard、成功 pin window、scene unavailable、provider fallback 可见 |
| P0 | Provider/secret failure 可见化 | credentials missing、secure-store degraded、permission denied、model unsupported 能映射到 result signal |
| P1 | AI Command Template v1 | 内置 5 个模板复用 OmniPanel actions 和 CoreBox AI Ask，不开放复杂编辑器 |
| P1 | OCR service 前台命令化 | file image / clipboard image 手动触发 OCR，并展示 job/result/redaction |
| P1 | Nexus Store capability card | 翻译/OCR/AI 插件展示 input types、permissions、provider requirements、privacy policy |
| P2 | Browser tab future | 只做显式授权的 tab title/url/selection，不默认读网页全文 |

## 9. 非目标

- 不重写 OCR service、Intelligence SDK 或 CoreBox。
- 不做全自然语言抢占式翻译，避免普通搜索被翻译 provider 噪音污染。
- 不复制 uTools 鼠标超级面板；只做 CoreBox / OmniPanel / MetaOverlay 可复用 Context Actions。
- 不把 provider secret 退回普通 plugin storage、manifest、localStorage 或日志。
- 不把剪贴板图片、截图 base64、selected text 全文长期落盘。
- 不开放 Alfred `Run Script` 等价裸 shell AI command。
- 不把 `image.translate.e2e` / packaged evidence 未覆盖的 dev 路径宣称为稳定体验闭环。

## 10. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只做任务 7/10，不改代码、不提交 | 通过 | 输出限定到本文件 |
| 2 | 基线 review：对齐 01-05 系列文档口径 | 通过 | 延续结论、矩阵、最小切片、非目标、引用结构 |
| 3 | 竞品事实 enforce：优先官方来源 | 通过 | 使用 Raycast Manual/Store、Alfred Help/Gallery、uTools Docs/Plugins |
| 4 | Tuff live tree review：不信旧 Done | 通过源码核对 | 以 `touch-translation`、`ocr-service`、`image-translate`、`touch-intelligence`、OmniPanel AI actions、secure-store 为准 |
| 5 | 输入来源 enforce：必须覆盖 8 类输入 | 通过 | 新增第 4 节输入来源矩阵 |
| 6 | Failure review：是否区分权限、网络、密钥、模型、OCR、scene | 通过 | 新增 failure taxonomy |
| 7 | Secret/privacy enforce：不得明文落盘 | 通过 | 保留 `usePluginSecret()`、safeStorage-first、hash/截断/ref 规则 |
| 8 | KISS/YAGNI review：是否建议大重构 | 未建议 | 收敛为 4 个小合同和 4 个最小切片 |
| 9 | Product/evidence review：是否把代码路径当体验闭环 | 未混淆 | 明确 packaged Electron、provider fallback、权限拒绝仍缺 |
| 10 | 文档完整性 enforce：是否含建议、矩阵、切片、非目标、来源 | 通过 | 补优先级、验收样本与引用来源 |

## 11. 引用来源

### Raycast

- Raycast Manual - Translate: https://manual.raycast.com/translate
- Raycast Manual - AI Commands: https://manual.raycast.com/ai/ai-commands
- Raycast Manual - Dynamic Placeholders: https://manual.raycast.com/dynamic-placeholders
- Raycast Manual - Search Bar: https://manual.raycast.com/search-bar
- Raycast Manual - Clipboard History: https://manual.raycast.com/clipboard-history
- Raycast Store: https://www.raycast.com/store
- Raycast Developers - Extensions: https://developers.raycast.com/

### Alfred

- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/
- Alfred Help - Script Filter Input: https://www.alfredapp.com/help/workflows/inputs/script-filter/
- Alfred Help - Universal Actions: https://www.alfredapp.com/help/features/universal-actions/
- Alfred Help - Automation Tasks: https://www.alfredapp.com/help/workflows/automations/automation-task/
- Alfred Gallery - Multi OCR: https://alfred.app/workflows/alfredapp/multi-ocr/
- Alfred Gallery: https://alfred.app/
- Alfred Gallery - DeepL Translate: https://alfred.app/workflows/meshchaninov/translate/

### uTools

- uTools 官网: https://www.u-tools.cn/
- uTools 帮助中心 - 超级面板: https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 帮助中心 - 功能指令: https://www.u-tools.cn/docs/guide/what-is-keyword.html
- uTools 帮助中心 - OCR 文字识别: https://www.u-tools.cn/docs/guide/plugin-ocr.html
- uTools 插件应用市场: https://www.u-tools.cn/plugins/
- uTools 插件专题 - AI: https://www.u-tools.cn/plugins/topic/52/
