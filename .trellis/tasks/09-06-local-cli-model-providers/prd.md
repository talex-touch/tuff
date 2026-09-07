# 本地 AI CLI（pi / pie / omp / codex / claude）作为可选聊天 provider

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-home-model-menu-v2`（模型选择器已支持多 provider 分栏、副标题、图标）。

## Goal

用户机器上已安装的 AI CLI 都在 Home 模型选择器里显示为独立 provider，展开各自的模型目录，
选中后本轮对话经该 CLI 执行并流式返回。现状只识别 `pi`。

## 需求来源

用户在真机验收模型选择器时提出：「为什么没有识别到 codex、claude code，还有 omp、pie、pi 都要识别」。

## Background

### 本机安装情况与已实测的行为（2026-09-06，均在 `/tmp` 空目录下实测）

| CLI | 版本 / 路径 | 模型目录 | 无交互调用与输出 | 实测 |
|---|---|---|---|---|
| pi | 0.84.3，mise node bin | `~/.pi/agent/models.json`（20 个模型，7 个 source），已接入 | `--print --mode json`，NDJSON；已接入 | 已在用 |
| pie | 0.1.45，`~/.local/bin/pie` | 无：`@talex-touch/touch-pie` 的 `bin/pie.mjs` 用 `which pi` 找到 pi 后 `run(piBin, argv)` 透传，只拦截 `update / version / about` | 同 pi | `pie --version` 输出 `Touch Pie v0.1.45`（不是 pi 的版本号） |
| omp | 18.0.11，`~/.bun/bin/omp`（`@oh-my-pi/pi-coding-agent`） | `omp models --json --no-extensions` → `{ models: [{ provider, id, selector, name, contextWindow, maxTokens, reasoning, thinking[], input[], cost }] }`，18 条，6 s；文件形态 `~/.omp/agent/models.yml`（含明文 apiKey）+ `config.yml` 的 `enabledModels` | `-p --mode json --no-tools --no-extensions --no-skills --no-rules --no-session --thinking off --system-prompt … --model provider/id @file… prompt` → **与 pi 相同的 NDJSON 事件**（`message_start / message_update{assistantMessageEvent.text_delta} / message_end{stopReason,usage}`） | 8 s 完成；`@file` 文本与 png 图片都被读取 |
| codex | 0.145.0，`/opt/homebrew/bin/codex` | 无目录命令；`~/.codex/config.toml` 的 `model`、`model_provider`、`[profiles.*]`（本机 `model = "gpt-5.5"`，provider TouchX 本地代理） | `codex exec --json --ephemeral --skip-git-repo-check --ignore-rules -s read-only -C <dir> --color never -c 'mcp_servers={}' -m <model> prompt`（stdin 需关闭）→ `thread.started / turn.started / item.completed{item.type:'agent_message',text} / turn.completed{usage}`；**无 delta，整段到达** | 不带 `-c mcp_servers={}` 时会启动用户全部 MCP server，75 s 才退出；带上后 17 s |
| claude | 2.1.259，`~/.local/bin/claude` | 无本地目录；SDK `supportedModels()` 需起会话 | `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence --strict-mcp-config --setting-sources "" --tools "" --disable-slash-commands --no-chrome --model <m> prompt` → `system/init{model,tools:[],mcp_servers:[]}` → `stream_event{event: message_start{model} / content_block_delta{delta.text} / message_stop}` → `result{subtype,is_error,result,usage,total_cost_usd}` | 2 s 完成 |

失败形态（实测）：
- codex 未知模型：`item.completed{item.type:'error',message}` + 多条 `error{message}` + `turn.failed{error.message}`，进程仍退出。
- claude 未知模型：`result{subtype:'success', is_error:true, result:'API Error: 400 …'}`，exit 1（`subtype` 不可信，看 `is_error`）。
- omp / pi：`message_end.stopReason` 非健康值（已有 `isFailedStopReason`）。

### 现有基础设施

- `apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts`（455 行）+ `pi-cli-runtime.ts`（645 行）：
  `IntelligenceProvider` 子类，`type = LOCAL`，运行时注入（`intelligence-config.ts:74-86`、`:520-523`，
  `withPiChatBinding` 补 text.chat 绑定），`provider-factory.ts:20` 按 `isPiCliProviderConfig`
  （id 或 `metadata.origin === 'pi-cli'`）选适配器；`buildPiArgs` / `buildPiPrompt` / `parsePiCliLine` /
  commit-rollback / 有界终止（`pi-provider-contracts.md` §6、§8）。可执行文件解析 `resolvePiExecutable`
  （PATH → 版本管理器根 → 固定 bin 根，含 `~/.bun/bin`、`~/.local/bin`），启动时 `probePiCliProvider()` settle 缓存。
- 模型目录读取 `pi-model-catalog.ts`：同步读文件 + mtime 签名缓存，密钥不出模块（契约 §7）。
- `apps/core-app/src/main/modules/local-ai-cli/`：pi / codex / claude / oh-my-pi 的可执行文件解析
  （`executable-resolver.ts`，PATH + 已知目录 + 登录 shell，5 s 版本探测）与任务 / 终端模式，整体在
  `TUFF_ENABLE_LOCAL_AI_CLI=1` 门后。`decodeLocalAiCliEvent` 解析 codex app-server / omp acp / claude SDK 事件，
  与本任务用的 `codex exec --json` / claude `stream-json` **不是同一协议**。
- 类型：`AiCliProviderId = codex | claude | pi | oh-my-pi | opencode`（`packages/utils/types/ai-orchestrator.ts`）。
  `IntelligenceProviderType` 六种固定；`SUPPORTED_PROVIDER_TYPES`（`intelligence-config.ts:30`）与
  `ALL_PROVIDERS`（`intelligence-module.ts:892`）按 type 过滤，pi 用 `LOCAL` + `metadata.origin` 绕过。
- `IntelligenceProviderModelOption`（`packages/utils/transport/sdk/domains/intelligence.ts:209`，
  `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts:187` 双镜像）无 provider 身份字段；
  renderer `provider-icons.ts` 按 `providerType` 取图标，所以 pi 显示为 `local` 的服务器图标。
- 路由：renderer 发 `preferredProviderId` + `modelPreference: [model]`（`useHomeConversation.ts:152-153`），
  main 收窄 `allowedProviderIds`（`intelligence-sdk.ts:1279-1284`）。
- TOML：`ai-import-config-parser.ts:110` 已有 `parseToml`（读 codex 配置用）；`yaml@2.9.0` 在根 workspace，core-app 未声明。
- 主进程测试基线：`intelligence-provider-model-options.test.ts:720-751` 四个 pi 用例；`pi-cli-runtime.test.ts` 解析用例。

## Decisions（已与用户确认）

- D1 pie = pi 的安装形态，不是独立 provider：找不到 `pi` 但找到 `pie` 时用 `pie` 作为 pi 的可执行文件；
  两者都在时 Pi 分栏显示名「Pi · Touch Pie」并用 Touch Pie 图标；目录仍读 `~/.pi/agent`。
- D2 codex / claude 的模型列表来自配置文件 + 固定别名：codex 读 `config.toml` 的 `model` 与各 `[profiles.*].model`，
  空则一行「Default」（不传 `-m`）；claude 固定 `fable / opus / sonnet` 三个别名 + `~/.claude/settings.json` 的 `model`
  （若有且不重复）。不起 SDK 会话。
- D3 找到即注册：探测到可执行文件就注入为 text.chat provider，不受 `TUFF_ENABLE_LOCAL_AI_CLI` 门限制
  （该门管的是工具调用 / 终端模式）。

## Requirements

- R1 识别与注入：启动时并行探测 pi（含 pie 回落）/ omp / codex / claude，各自作为运行时 provider 注入
  （不持久化，同 pi），每个都补 text.chat 绑定（优先级在 pi 之后，仍是 floor）。
- R2 身份：`IntelligenceProviderModelOption` 增加 `origin?: string`（值 `pi-cli | omp-cli | codex-cli | claude-cli`），
  双镜像同步；renderer 图标优先按 origin，回落 type。显示名：`Pi (local CLI)`（或 `Pi · Touch Pie`）、
  `OMP (local CLI)`、`Codex (local CLI)`、`Claude Code (local CLI)`。
- R3 模型目录：omp 优先 `omp models --json --no-extensions`（异步、6 s、缓存 + 超时回落），回落读
  `~/.omp/agent/models.yml`（同 pi 的密钥边界）；显示 id 用 `selector`（`provider/id`）以便菜单副标题按 `/` 拆 source。
  codex / claude 按 D2。目录读取失败 → 该 provider 行为空并从菜单消失，不影响其他 provider。
- R4 执行（answer-only）：选中后本轮经该 CLI 执行，参数按 Background 表；不授予工具、不加载扩展 / 技能 / 规则 /
  MCP，不持久化会话，stdin 关闭；系统提示复用 `buildPiPrompt` 的无工具变体；omp 支持 `@file` 附件（沿用 spill）。
  codex / claude 不支持附件时按 `pi-provider-contracts.md` §2 的「非 pi provider 忽略字段」处理。
- R5 流式与结束语义：omp 复用 pi 的 NDJSON 解析与 commit / rollback；claude 解析 `stream_event` 的 `content_block_delta`
  并以 `result.is_error` 判定失败；codex 无 delta，`item.completed(agent_message)` 一次性交付，`turn.failed` 判定失败。
  取消 / 超时 / 终止沿用 pi 的有界终止契约（§8）。
- R6 失败路径 fail-closed：可执行文件消失、未登录 / 401、模型不存在、进程异常退出都返回带恢复建议的错误
  （沿用 `PI_CLI_NOT_FOUND` 的形态，新增各 CLI 的 `*_CLI_NOT_FOUND`），不得伪成功。
- R7 pie 识别：`resolvePiExecutable` 在所有 pi 候选都缺席后再找 `pie`；探测日志与 provider 名区分两种形态。
- R9 模型行图标（用户补充需求）：行图标按**模型家族**而不是 provider 取。从模型 id（去掉 `source/` 前缀）匹配家族：
  gpt / o1 / o3 / o4 / codex → OpenAI；claude → Claude；gemini → Gemini；deepseek → DeepSeek；qwen / qwq → Qwen；
  llama → Meta；mistral / mixtral / codestral → Mistral；grok → xAI（无品牌图标，用 `i-simple-icons-x`）；
  kimi / moonshot → Kimi；glm / zhipu / chatglm → 智谱（无品牌图标，回落通用）；minimax → MiniMax；
  doubao → 字节；ernie → 百度；yi → 通用；无匹配 → provider 图标（origin → type 回落链）。
  provider 分栏按钮仍用 provider 图标（origin 优先）。所有家族图标类进入 UnoCSS safelist（由表派生）。
  已核验 `@iconify-json/simple-icons` 含：openai anthropic claude claudecode googlegemini deepseek qwen meta
  mistralai kimi moonshotai minimax bytedance baidu ollama huggingface perplexity githubcopilot cursor windsurf。
- R8 主进程安全：子进程 env 沿用 pi 的净化（PATH 补 bin 目录，不透传 tool gateway 变量）；日志不得包含
  prompt、apiKey、config 内容（`pi-provider-contracts.md` §7 的 warn 规则）。

## Acceptance Criteria

- [ ] AC1 本机四个 CLI 都在时，模型菜单出现 Pi（Touch Pie 名与图标）/ OMP / Codex / Claude Code 四个分栏；
      OMP 下有 18 行且副标题为「OMP (local CLI) · codex」等；Codex 下有 `gpt-5.5`；Claude Code 下有三个别名。
- [ ] AC2 选中 `codex/gpt-5.6-terra`（OMP）发送「Reply with the single word pong」，流式返回 `pong`，
      对话信息面板 provider / model 显示 OMP 与该模型。
- [ ] AC3 同样的消息经 Claude Code（sonnet）与 Codex（gpt-5.5）各返回一次；Codex 一次性到达可接受。
- [ ] AC4 把 `~/.local/bin/pie` 之外的 pi 临时移出 PATH（或用 `TUFF_PI_CLI_PATH` 指向 pie）：Pi 分栏仍在，名为「Pi · Touch Pie」。
- [ ] AC5 选中 Claude Code 后传一个不存在的模型：对话显示明确错误与恢复建议，不显示空回复。
- [ ] AC6 发送中取消：子进程在契约窗口内退出，无残留进程（`pgrep -f 'omp|codex exec|claude -p'` 为空）。
- [ ] AC7 未安装 CLI 的机器（用 `TUFF_*_CLI_PATH=/nonexistent` 模拟）：菜单不出现该分栏，启动日志一行 info，无 warn。
- [ ] AC8b 图标：`qwen2.5:3b` 行显示 Qwen 图标、`codex/gpt-6-astra` 行显示 OpenAI 图标、`cpa/grok-4.6` 显示 xAI（X）图标、
      `DeepSeekOfficial/deepseek-v4-pro` 显示 DeepSeek 图标；分栏按钮显示各 CLI 的 provider 图标；无家族匹配的模型回落 provider 图标。
- [ ] AC8 测试：解析器（omp 复用 pi、claude stream-json、codex exec json 三组 fixture）、目录读取（omp json / yml、
      codex toml、claude 别名）、可执行文件解析（pie 回落）、模型选项（四个 provider 行、缺席移除）、
      渲染层 origin 图标；`typecheck:node`、`typecheck:web`、`git diff --check` 通过。
- [ ] AC9 契约文档：`pi-provider-contracts.md` 扩展为本地 CLI provider 家族的契约（参数矩阵、结束语义、密钥边界）。

## Out of scope

- 工具调用 / 工作区写入（local-ai-cli 的 task / terminal 模式与其 beta 门）。
- opencode 及其他未安装的 CLI；Windows 上的探测路径（本任务只承诺 darwin，Windows 走 PATH）。
- Intelligence 设置页对这些 provider 的配置 UI；effort / thinking 级别选择（沿用 CLI 默认）。
