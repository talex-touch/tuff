# Alfred Workflow 模型专项

> 日期：2026-05-22
> 范围：Alfred Workflows 模型与 Tuff Manifest / Prelude / Surface、CoreBox provider、Flow、DivisionBox、Intelligence、tuff-cli、Nexus SDK 文档对照。
> 约束：不照搬 Alfred 的大而全可视化编排；只提出 Tuff 可落地的文本 / manifest / SDK 小切片。

## 1. 结论

Alfred Workflows 的核心价值不是“能写脚本”，而是把桌面效率动作抽象成一条可调试、可配置、可分享的对象流：Trigger 或 Input 进入 workflow，Script Filter 或 Keyword 把用户输入转成候选项，Action / Utility 转换或执行数据，Output 把结果落到剪贴板、通知、文件、脚本或 Alfred UI，再由 Variables、Workflow Configuration、Debugger、Gallery 把同一条流程变成可维护生态资产。

Tuff 当前已经具备承接 Alfred Workflow 模型的底座：Manifest 声明 feature / permissions / acceptedInputTypes，Prelude 处理 `onFeatureTriggered` / `onItemAction`，CoreBox provider 负责搜索和执行，Flow 负责插件间结构化数据传递，DivisionBox 承载复杂 UI，Intelligence Workflow 已有 manual trigger、context sources、model/tool steps、run history、review queue，tuff-cli 与 Nexus 已覆盖 validate/build/publish 与 SDK 文档任务流。

真正缺口在“统一 workflow contract”，不是缺一个大型可视化编辑器。Tuff 现在的能力散在插件 feature、CoreBox item action、Flow target、AI workflow step、DivisionBox session 和 Nexus 发布链路中，开发者无法用一个稳定合同表达“输入是什么、参数来自哪里、动作怎么编排、失败如何展示、日志如何追踪、权限在哪里收口、如何安装分享”。

建议 Tuff 先做 **workflow contract v1**：以 manifest 扩展 + Prelude handler + typed SDK 为主，支持 command / context / external 三类入口，支持 text/image/files/html/json 输入，支持 `feature.action`、`flow.dispatch`、`division.open`、`intelligence.invoke`、`clipboard.write`、`browser.open` 等少量动作，统一 run record、step trace、failure reason、permission preflight 和 Nexus publish metadata。不要先做 Alfred 式完整节点库、拖拽画布或系统级热字符串自动展开。

## 2. Alfred Workflow 核心模型

| 模型 | Alfred 行为 | 对开发者的意义 | Tuff 借鉴点 |
| --- | --- | --- | --- |
| Triggers | Hotkey、Snippet、External Trigger、File Action、Universal Action 等从 Alfred 外部或上下文触发 workflow | workflow 不必只从搜索框开始，可由快捷键、外部 URL、选中文本/文件动作触发 | Tuff 先支持 `manual` / `command` / `context` / `external`，不急于覆盖所有系统触发器 |
| Inputs | Keyword、Script Filter、File Filter、List Filter、Arg and Vars 等把用户输入转成对象流 | 输入阶段可以决定候选项、参数、图标、有效性和下游变量 | Tuff CoreBox feature + push item 已能承接 Keyword / Script Filter 的最小形态 |
| Actions | Open File、Run Script、Copy、Browse in Terminal、Dispatch Key Combo、Universal Action 等执行或传递对象 | 动作节点负责消耗输入对象并调用系统能力 | Tuff 应把 action 收敛到 typed SDK，而不是开放裸 shell / raw IPC |
| Utilities | Arg and Vars、Filter、Split、Replace、Conditional、Delay、Junction 等转换对象和变量 | 让 workflow 组合而不必每步都写脚本 | Tuff v1 只需要 `setVars`、`mapInput`、`condition`、`stop` 四类轻量 utility |
| Outputs | Clipboard、Notification、Large Type、Post Notification、Run Script 等把结果交回用户或系统 | workflow 需要明确结束态和用户可见反馈 | Tuff 输出应统一到 CoreBox item、clipboard、notification、DivisionBox、run summary |
| Variables | 环境变量、workflow variables、session variables、Arg and Vars 贯穿执行链 | 参数和中间态是 workflow 可维护性的核心 | Tuff v1 用 `params`、`vars`、`context`、`steps.<id>.output` 四个命名空间即可 |
| Script Filter | 脚本动态返回 JSON item，包含 title/subtitle/arg/icon/valid/match/autocomplete/variables/mods/text 等 | Alfred 最强的动态搜索扩展点 | Tuff 可用 Prelude `onFeatureTriggered` 返回 `TuffItem[]` 对齐，但需要明确 JSON contract 与取消/超时/错误语义 |
| External Trigger | 允许外部调用 workflow trigger，并可传入参数 | workflow 可被 URL scheme、脚本或其他自动化唤起 | Tuff 可通过 typed event / deep link / CLI local dispatch 做受控 external trigger |
| Universal Actions | 对选中文本、文件、URL 等上下文展示可用动作，workflow 可扩展动作列表 | 这是 Alfred 的上下文动作入口 | Tuff 应把 `acceptedInputTypes`、Flow target 和 ContextActionProvider 合并成 v1 |
| Debugger | 查看 workflow 对象、脚本输出、错误、变量流 | 开发者可定位是哪一步失败 | Tuff 已有 workflow run record、trace、plugin logs、`.workflow/.debug`，但缺统一 workflow debugger UI / CLI |
| Gallery / 分享 | 官方 Gallery 分发 workflow，workflow 可被安装、更新和查看元数据 | 生态可发现、可安装、可维护 | Tuff Nexus Store + `.tpex` publish 可以承接，但需要 workflow metadata 和安全扫描口径 |
| Workflow Configuration | 安装后用户可填写 API key、选项、文本、checkbox 等配置 | 同一个 workflow 可复用，不必 fork 修改脚本 | Tuff 应优先复用 plugin storage / secret / settings schema，不把 secret 写 manifest |

## 3. Tuff 当前能力对照

| Tuff 能力 | 证据路径 | 可承接 Alfred 模型 | 当前不足 |
| --- | --- | --- | --- |
| Plugin Manifest | `apps/nexus/content/docs/dev/reference/manifest.zh.mdc`、`packages/utils/plugin/index.ts` | 声明 feature、commands、acceptedInputTypes、permissions、category、main | 没有 workflow-level triggers/params/steps/config schema |
| Prelude | `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc`、`apps/core-app/src/main/modules/plugin/plugin-feature.ts` | `onFeatureTriggered` / `onItemAction` 对齐 Keyword、Script Filter、Action | handler 返回值、step trace、参数注入、错误 UI 还不是统一 workflow 合同 |
| CoreBox provider | `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts` | 搜索 feature、匹配 commands、按 input types 过滤、push mode 动态结果 | 只能看 feature 级结果，不能表达多步骤 workflow run |
| Plugin Surface | `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts`、`apps/nexus/content/docs/dev/architecture/plugin-system.zh.mdc`、`apps/nexus/content/docs/dev/architecture/corebox-and-views.zh.mdc` | `interaction.type: "webcontent"` 可进入 CoreBox UI mode，并通过 `attachUIView` / `WebContentsView` 加载重量级插件 UI | Surface 是 UI 承载层，不是 workflow 编排层；不应把简单 workflow 都升级成 Surface |
| TuffItem / Action | `packages/utils/core-box/builder/*`、`PluginFeaturesAdapter.createTuffItem()` | 可表达候选项、默认动作、复制/执行 payload | 缺 Alfred Script Filter 风格的 mods、autocomplete、item variables、valid reason 的标准映射 |
| Flow Transfer | `packages/utils/types/flow.ts`、`packages/utils/plugin/sdk/flow.ts` | 对齐对象流传递、Universal Actions 的上下文数据分发 | 现在是插件间 transfer，不是 workflow step graph；target selection 与 workflow trigger 尚未统一 |
| DivisionBox | `packages/utils/types/division-box.ts`、`packages/utils/plugin/sdk/division-box.ts` | 承载复杂配置、结果预览、长流程 UI | 不是 workflow runtime；不应把每个 workflow 都做成 Surface |
| Intelligence Workflow | `packages/utils/types/intelligence.ts`、`apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts` | 已有 WorkflowDefinition、triggers、contextSources、steps、run history、review queue | 目前偏 AI/model/tool workflow，不能直接覆盖普通插件动作编排 |
| Workflow Tools | `apps/core-app/src/main/modules/ai/agents/tools/workflow-tools.ts` | 已有 clipboard、desktop context、browser open/search/extract 等内置 tool | 权限名与插件权限体系尚未统一；普通插件 workflow 不应强依赖 AI runtime |
| tuff-cli | `packages/tuff-cli-core/src/validate.ts`、`publish.ts`、Nexus plugin workflow docs | 可承担 validate/build/publish/dry-run | 需要新增 workflow schema 校验与本地 dry-run，不是只校验 manifest |
| Nexus SDK / Store | `apps/nexus/content/docs/dev/api/*`、`apps/nexus/app/data/tuffSdkItems.ts` | 可发布 SDK 文档、插件包、内容包和 workflow 元数据 | 缺“workflow capability card”、配置说明、安装后设置引导、审计标记 |
| Plugin logs / debug | `apps/core-app/src/main/utils/workflow-debug.ts`、PluginLogs UI、Intelligence trace | 有日志和 run 记录基础 | 缺 workflow run timeline、step input/output redaction、CLI `tuff workflow run --dry-run` |

## 4. Alfred Workflow -> Tuff Workflow / Plugin 映射矩阵

| Alfred 概念 | 用户体验 | 开发者 API | Tuff 现状 | 缺口 | 最小实现建议 |
| --- | --- | --- | --- | --- | --- |
| Keyword Input | 输入关键词后出现 workflow 结果 | `features[].commands` + Prelude `onFeatureTriggered` | 已支持 match/contain/regex/over 与 fuzzy search | 缺 workflow params 与 run record | 在 manifest 增 `workflows[].triggers.command`，复用 feature command 匹配 |
| Script Filter | 输入变化时脚本返回动态候选项 | Prelude 返回 `TuffItem[]` | push feature 与 item action 已有 | 缺 Script Filter item schema 兼容层、超时、取消、错误提示 | 定义 `WorkflowSearchItem`，映射到 `TuffItem`，强制支持 `signal` 和 `errorCode` |
| File Filter | 搜索文件并把文件传入下游 | CoreBox FileProvider / Flow payload `files` | 文件搜索与 Flow files 类型存在 | 文件搜索结果不能直接作为 workflow step 输入 | 在 ContextActionProvider v1 中支持 file item -> workflow input |
| Universal Action | 对选中文本/文件/URL 呼出动作列表 | `acceptedInputTypes` + Flow target + context action | acceptedInputTypes 与 Flow target 分散存在 | 没有统一上下文动作入口 | 新增 `contextActions` manifest 字段，先支持 text/files/image/html |
| Hotkey Trigger | 快捷键直接运行 workflow | Shortcut module + feature commands | 插件可有快捷键相关能力但非统一 workflow trigger | 快捷键注册与 workflow 权限/冲突 UI 未统一 | v1 暂只允许 manifest 声明可选 hotkey，默认不绑定，用户手动启用 |
| External Trigger | 外部调用 workflow 并传参 | typed event / deep link / local CLI | 有 transport 和 protocol 基础，但未形成 workflow trigger | 安全边界、来源鉴权、参数 schema 缺失 | 做 `tuff workflow run <id> --json` 本地 CLI + app deep link allowlist |
| Actions | 打开 URL、复制、运行脚本、调用 app | typed plugin SDK / tool registry | clipboard/browser/system/window/intelligence 能力分散存在 | 需要 action allowlist 与 permission preflight | v1 只开放内置 typed actions，不开放任意 shell；shell 走 `system.shell` 明确授权 |
| Utilities | 变量转换、条件、过滤、延迟 | workflow step `kind: utility` | AI workflow step kind 目前偏 prompt/tool/agent/model | 普通 utility 缺 schema | v1 增 `setVars`、`map`、`condition`、`stop`，不做循环/并行 |
| Outputs | 剪贴板、通知、UI、文件 | `clipboard.write`、notification、DivisionBox、CoreBox result | 能力存在 | 输出语义分散，失败态不统一 | 每个 workflow run 只允许一个 primary output + 多个 side effects |
| Variables | 跨节点变量和配置 | `params` / `vars` / `context` / `steps` | plugin storage、secret、workflow metadata 存在 | 命名空间和 redaction 缺失 | v1 固定四命名空间，secret 只传 `authRef` |
| Workflow Configuration | 用户安装后填写选项 / secret | settings schema + plugin storage / secret | storage、secret health、settings 示例存在 | 缺 manifest schema 和安装后配置 UI | `workflows[].configSchema` + `secretRefs`，Nexus 展示 required setup |
| Debugger | 看每一步输入、输出、错误和脚本日志 | run record + step trace + plugin logs | Intelligence run history、plugin logs、workflow-debug 文件存在 | 普通 plugin workflow 无 timeline | `workflowRuns` 本地表或复用 AI run record，支持 redacted input/output |
| Gallery / Share | 安装和更新 workflow | `.tpex` + Nexus Store | 插件发布链路存在 | workflow 元数据不可发现，安全说明不足 | Nexus 增 workflow card：triggers、inputs、permissions、config required、last validated |

## 5. Tuff Workflow Contract v1 建议

### 5.1 Manifest 结构

```json
{
  "workflows": [
    {
      "id": "snippets.clean-and-copy",
      "name": "清洗并复制片段",
      "description": "对输入文本做清洗、格式化并复制结果。",
      "version": "1",
      "triggers": [
        {
          "type": "command",
          "commands": [{ "type": "match", "value": ["clean", "清洗"] }]
        },
        {
          "type": "context",
          "acceptedInputTypes": ["text", "html"]
        }
      ],
      "input": {
        "schema": {
          "type": "object",
          "properties": {
            "text": { "type": "string" }
          },
          "required": ["text"]
        }
      },
      "configSchema": {
        "type": "object",
        "properties": {
          "trimWhitespace": { "type": "boolean", "default": true }
        }
      },
      "steps": [
        {
          "id": "normalize",
          "kind": "utility.map",
          "input": { "text": "{{input.text}}" },
          "set": { "vars.cleaned": "{{input.text}}" }
        },
        {
          "id": "copy",
          "kind": "action.clipboard.write",
          "input": { "text": "{{vars.cleaned}}" }
        }
      ],
      "output": {
        "primary": "clipboard",
        "preview": "{{vars.cleaned}}"
      }
    }
  ]
}
```

这个结构只作为 contract 建议，不要求首版完全落代码。它的关键是把 feature 和 workflow 连接起来：feature 负责被 CoreBox 搜到，workflow 负责可追踪执行。

### 5.2 输入与参数

| 名称 | 来源 | v1 范围 |
| --- | --- | --- |
| `input` | CoreBox query、context action、external trigger 参数 | text、image、files、html、json |
| `params` | 用户在 workflow configuration 中填写的普通配置 | string、number、boolean、enum、array |
| `secrets` | secure store 返回的引用 | 只传 `authRef` / `secretRef`，不把明文写入 run record |
| `context` | desktop active app、clipboard recent、selected text/file、plugin metadata | 只读快照，默认最小化采集 |
| `vars` | workflow 内部变量 | 仅本次 run 有效 |
| `steps.<id>.output` | 上一步输出 | 默认 redacted preview，完整大对象按需引用 |

### 5.3 触发器

v1 只建议支持四类：

| Trigger | 说明 | 权限边界 |
| --- | --- | --- |
| `command` | CoreBox 输入命中命令或 fuzzy feature | 复用现有 plugin feature permission |
| `context` | 对 selected text / clipboard image / files 展示动作 | 输入类型必须在 manifest 声明 |
| `manual` | 设置页、Workflow 页面或插件 UI 手动运行 | 不自动读取敏感上下文 |
| `external` | 本机 CLI / deep link / typed event 唤起 | 默认关闭，需要用户允许来源和 workflow id |

暂不建议首版支持系统级 Snippet Trigger、全局自动监听文件变化、定时任务和任意 URL scheme 自动执行。这些都容易引入权限、隐私、资源消耗和假成功问题。

### 5.4 动作编排

v1 动作保持窄集合：

| Step kind | 用途 | 对应现有能力 |
| --- | --- | --- |
| `utility.setVars` | 设置变量 | 新增轻量解释器即可 |
| `utility.map` | 从 input/context/steps 取值并改名 | 新增轻量解释器即可 |
| `utility.condition` | 条件分支或停止 | 新增轻量解释器即可 |
| `action.feature.run` | 调用当前插件 feature handler | Prelude |
| `action.item.run` | 执行某个 TuffItem action | CoreBox action pipeline |
| `action.flow.dispatch` | 把 payload 交给插件/系统 target | Flow SDK |
| `action.division.open` | 打开 UI / 结果窗口 | DivisionBox SDK |
| `action.surface.open` | 打开插件重量级 UI | Plugin Surface / WebContentsView |
| `action.intelligence.invoke` | 调用 AI capability | Intelligence SDK |
| `action.clipboard.write` | 写剪贴板 | Clipboard SDK |
| `action.browser.open` | 打开 URL | existing browser tool / shell-open typed wrapper |
| `action.notification.show` | 展示通知 | Notification typed event |

不建议 v1 直接提供 Alfred `Run Script` 等价能力。需要 shell 时，应作为高风险 `system.shell` action，必须具备 permission preflight、平台支持 reason、timeout、cwd 校验、输出截断和 run log redaction。

### 5.5 失败态与可观测性

每次 workflow run 应产生：

| 字段 | 说明 |
| --- | --- |
| `runId` | 本次执行 ID |
| `workflowId` | workflow ID 与版本 |
| `trigger` | 触发方式、来源、是否外部 |
| `status` | `pending` / `running` / `waiting_approval` / `completed` / `failed` / `cancelled` |
| `steps[]` | 每步 startedAt、completedAt、status、duration、inputPreview、outputPreview、errorCode |
| `permissions` | preflight 结果、blocked reason、unsupported reason |
| `logs` | plugin logger / workflow debugger 的相关片段 |
| `redactions` | 哪些字段被脱敏、哪些 secret 只保留 ref |

失败必须显式暴露给 CoreBox / Workflow 页面 / plugin logs，不能返回空结果伪装成功。`continueOnError` 只允许在 manifest 或 run 参数中显式声明，并在 UI 里显示跳过了哪一步。

### 5.6 权限边界

| 能力 | v1 规则 |
| --- | --- |
| 剪贴板读 | 必须声明 `clipboard.read`，context trigger 只读取本次输入 |
| 剪贴板写 | 可低风险自动授权，但 run log 只保留长度和 preview |
| 文件读写 | 文件输入只传 path/ref；读写内容必须单独授权 |
| 网络 | `network.internet` 需声明域名或 provider 场景 |
| Shell | 默认不开放；开放时必须 fail-closed |
| AI | 走 Intelligence capability，不直接写 provider key |
| Secret | 走 secure-store / plugin secret，不进入 JSON config、manifest、run output |
| External Trigger | 默认关闭；启用后记录来源、参数 schema 和最后调用时间 |

### 5.7 发布 / 安装

Nexus Store 和 tuff-cli 应补充 workflow 视角的 metadata：

| 环节 | 最小要求 |
| --- | --- |
| `tuff validate --strict` | 校验 `workflows[].id` 唯一、trigger/input/config/step schema、权限与 action 匹配 |
| `tuff build` | 把 workflow metadata 写入 `.tpex` manifest，保留源码 sourcemap 策略 |
| `tuff publish --dry-run` | 展示 workflow triggers、inputs、permissions、config required、external trigger 是否启用 |
| Nexus Store | workflow cards 展示“可从 CoreBox / Context / External 触发”、权限、配置项、最近验证状态 |
| 安装后 | 如果 `configSchema.required` 或 `secretRefs.required` 未满足，feature 可见但执行返回 setup required |
| 更新 | workflow version 变化需要记录 migration note，避免 silently 改变高风险动作 |

## 6. 不照搬 Alfred 的边界

| Alfred 能力 | 不照搬原因 | Tuff 替代路径 |
| --- | --- | --- |
| 完整可视化节点画布 | 当前 Tuff 主线是 2.4.11 稳定化与 2.5.0 AI 文本/OCR，画布会抢占基础 evidence | 先做 JSON/manifest contract + 简单 Workflow 页面编辑 |
| 任意 Run Script 节点 | 与 Tuff fail-closed、permission diagnostics、跨平台边界冲突 | 使用 typed actions；shell 单独高风险授权 |
| 全局热字符串系统注入 | 容易引入隐私、输入法、焦点和平台差异问题 | Snippets placeholders 先走 CoreBox / explicit paste |
| 复杂循环/并行/Junction | v1 不需要，为未来预留会增加解释器复杂度 | `condition` + `continueOnError` 足够支撑首批 |
| 无约束 External Trigger | 自动化入口容易被滥用 | 本机 allowlist + schema + run log |
| 把所有结果都塞进 UI Surface | Surface 成本高，也不适合简单动作 | 简单 workflow 只返回 CoreBox item / clipboard / notification；复杂才开 DivisionBox |

## 7. 推荐落地切片

| 切片 | 范围 | 验收证据 | 不做 |
| --- | --- | --- | --- |
| `workflow-contract-v1-doc` | 写入 manifest contract、SDK 类型草案、Nexus 文档任务流 | 文档含 schema、示例、权限表、迁移边界 | 不改 runtime |
| `workflow-validate-v1` | tuff-cli 校验 workflow schema 与权限/action 匹配 | focused unit + dry-run 输出 | 不运行 workflow |
| `corebox-workflow-trigger-v1` | command trigger -> run record -> Prelude action | CoreBox 输入、执行、失败提示、plugin log | 不做可视化画布 |
| `context-action-v1` | selected text / clipboard image / files -> workflow actions | acceptedInputTypes、permission denied、unsupported reason | 不做 uTools 式鼠标超级面板 |
| `workflow-debug-v1` | run timeline、step logs、redacted input/output | Workflow 页面或 Plugin Logs 可查 runId | 不存 secret 明文 |
| `nexus-workflow-card-v1` | Store 展示 workflow metadata 与 setup required | `.tpex` dry-run + Nexus card 截图 | 不做审核系统重构 |

## 8. 10 轮 enforce / review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只产出任务 3/10 的 Alfred Workflow 专项文档 | 通过 | 只新增本文件，不修改代码与总入口文档 |
| 2 | 官方事实 review：必须覆盖 Triggers、Inputs、Actions、Utilities、Outputs、Variables、Script Filter、External Trigger、Universal Actions、Debugger、Gallery、configuration | 通过 | 第 2 节逐项覆盖，引用集中到末尾 |
| 3 | 仓库证据 enforce：不能只靠旧 Done | 通过 live tree 阅读 | 复核 Manifest、PluginFeature、PluginFeaturesAdapter、Flow、DivisionBox、Intelligence Workflow、tuff-cli、Nexus 文档 |
| 4 | 模型映射 review：Alfred 概念必须落到 Tuff 用户体验 / API / 现状 / 缺口 / 建议 | 通过 | 第 4 节提供完整映射矩阵 |
| 5 | KISS / YAGNI enforce：不能建议大而全可视化编排 | 通过 | 明确 contract v1 优先，画布、循环、并行、任意脚本后置 |
| 6 | 权限与安全 review：External Trigger、Shell、Secret、文件/网络必须 fail-closed | 通过 | 第 5.6 节集中定义权限边界 |
| 7 | 产品边界 enforce：不要把 AI Workflow 当普通 Workflow 的唯一实现 | 通过 | 区分 Intelligence Workflow 现状和普通 plugin workflow contract |
| 8 | 调试可观测 review：必须覆盖 Debugger / logs / run record | 通过 | 第 5.5 与第 7 节定义 run timeline 和 redaction |
| 9 | 发布安装 review：必须覆盖 Gallery / 分享 / Workflow configuration | 通过 | 第 5.7 节定义 validate/build/publish/Nexus/安装后 setup required |
| 10 | 可执行性 review：输出应能转成小任务 | 通过 | 第 7 节拆成 6 个可验收切片 |

## 9. 引用来源

### Alfred 官方文档

- Alfred Workflows: https://www.alfredapp.com/help/workflows/
- Alfred Workflow Triggers: https://www.alfredapp.com/help/workflows/triggers/
- Alfred External Trigger: https://www.alfredapp.com/help/workflows/triggers/external/
- Alfred Workflow Inputs: https://www.alfredapp.com/help/workflows/inputs/
- Alfred Script Filter: https://www.alfredapp.com/help/workflows/inputs/script-filter/
- Alfred Script Filter JSON Format: https://www.alfredapp.com/help/workflows/inputs/script-filter/json/
- Alfred Workflow Actions: https://www.alfredapp.com/help/workflows/actions/
- Alfred Workflow Utilities: https://www.alfredapp.com/help/workflows/utilities/
- Alfred Workflow Outputs: https://www.alfredapp.com/help/workflows/outputs/
- Alfred Workflow Variables: https://www.alfredapp.com/help/workflows/advanced/variables/
- Alfred Workflow Debugger: https://www.alfredapp.com/help/workflows/advanced/debugger/
- Alfred Workflow Configuration: https://www.alfredapp.com/help/workflows/workflow-configuration/
- Alfred Universal Actions: https://www.alfredapp.com/help/features/universal-actions/
- Alfred Gallery: https://alfred.app/

### 仓库基线

- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md`
- `docs/plan-prd/TODO.md`
- `apps/nexus/content/docs/dev/reference/manifest.zh.mdc`
- `apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc`
- `packages/utils/types/flow.ts`
- `packages/utils/types/division-box.ts`
- `packages/utils/types/intelligence.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/ai/intelligence-workflow-service.ts`
