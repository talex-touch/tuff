# Design — 本地 AI CLI 作为可选聊天 provider

Parent: `.trellis/tasks/09-06-model-menu-redesign`

## 1. 问题一句话

四个本地 CLI 都是「可执行文件 + 无交互模式 + 行式 JSON 输出」，现在只有 pi 走通了这条路，
且 pi 的实现把「可执行文件解析 / 参数 / 解析器 / 有界终止」四件事写在一个 provider 里，第二个 CLI 无法复用。

## 2. 基本事实与推论

- 三种输出协议：pi 与 omp 是同一 NDJSON（omp 是 pi 的分支，实测事件逐字段一致）；claude 是 `stream-json`；
  codex 是 `exec --json`，无 delta。所以解析器是「一个 pi/omp + 两个新的」，不是四个。
- 有界终止、abort、readline 清理、附件 spill 与 pi 完全同构，只有 argv 与解析器不同 → 抽一个共享的子进程运行时，
  provider 只提供「argv 构造 + 行解析器 + 结束判定」。
- `IntelligenceProviderType` 枚举不能改（`tuff-intelligence` 的枚举 + 所有穷举列表）；沿用 pi 的做法：
  `type = LOCAL` + `metadata.origin` 区分。
- 模型目录来源三种：文件（pi）、子命令（omp，异步 6 s）、配置 + 固定别名（codex / claude）。
  `getProviderModelOptions` 是同步的（插件宿主冻结依赖），所以异步来源必须「启动时预热 + 缓存 + 同步读缓存」。

## 3. 边界与文件归属

| 层 | 文件 | 职责 |
|---|---|---|
| 运行时 | `main/modules/ai/providers/cli/cli-process-runtime.ts`（新） | 从 `pi-cli-provider.ts` 抽出：spawn + env 净化、readline、abort、SIGTERM/SIGKILL 有界终止、stderr tail、附件 spill 生命周期。输入 `{ executable, args, env, parseLine, isTerminalFailure }`，输出 `AsyncGenerator<IntelligenceStreamChunk>` |
| 运行时 | `main/modules/ai/providers/cli/cli-executable.ts`（新） | 通用可执行文件解析（从 `pi-cli-runtime.ts` 的 discovery 段抽出，参数化 command 与 env override 名），带缓存与 `reset*`；pie 回落在 pi 的 resolver 里实现 |
| 解析器 | `pi-cli-runtime.ts`（保留，omp 复用 `parsePiCliLine` / `isFailedStopReason` / `buildPiPrompt`） | 不变 |
| 解析器 | `providers/cli/claude-stream-json.ts`（新） | `stream_event.content_block_delta` → delta；`message_start.model` → model；`result` → usage / cost / `is_error` |
| 解析器 | `providers/cli/codex-exec-json.ts`（新） | `item.completed(agent_message)` → 整段 delta + commit；`item.completed(error)` / `turn.failed` → failure；`turn.completed.usage` → usage |
| provider | `providers/omp-cli-provider.ts`、`claude-cli-provider.ts`、`codex-cli-provider.ts`（新） | 各 ≈ 100 行：argv、系统提示、模型参数、附件策略、`chat()` 聚合（复用 pi 的聚合模式） |
| provider | `pi-cli-provider.ts`（改） | 改为消费共享运行时；行为与测试不变 |
| 目录 | `providers/cli/omp-model-catalog.ts`（新） | `omp models --json --no-extensions`（超时 10 s，缓存 5 min）→ `selector[]`；失败回落 `~/.omp/agent/models.yml`（`yaml` 依赖需加到 core-app；解析后只取 provider 名与 model id）；密钥边界同 pi |
| 目录 | `providers/cli/codex-model-catalog.ts`、`claude-model-catalog.ts`（新） | codex：复用 `ai-import-config-parser.ts` 的 `parseToml`，取 `model` + `profiles.*.model`；claude：常量别名 + `settings.json.model` |
| 注册 | `providers/cli/cli-provider-registry.ts`（新） | 四个 `LocalCliProviderDefinition { id, origin, command, altCommands?, displayName(form), icon, probe, catalog, factory }`；`probeAll()` 并行；`getResolved(origin)` 同步读缓存 |
| 注册 | `intelligence-config.ts`（改） | `PI_CLI_PROVIDER` 泛化为按 registry 注入 N 个运行时 provider，`withPiChatBinding` → `withLocalCliChatBindings`（优先级 99, 100, 101, 102） |
| 工厂 | `provider-factory.ts`（改） | `createLocalProvider` 按 `metadata.origin` 分派到四个 provider 类 |
| 选项 | `intelligence-provider-model-options.ts`（改） | `resolveDeclaredModels` 按 origin 取目录；返回值加 `origin`、`providerLabel` 沿用 `name` |
| 类型 | `packages/utils/transport/sdk/domains/intelligence.ts`、`packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`（双镜像） | `IntelligenceProviderModelOption.origin?: string` |
| 渲染 | `modules/intelligence/provider-icons.ts`（改） | `providerIconFor(type, origin?)`：origin 优先（pi / touch-pie / omp / codex / claude 五个图标），safelist 同步 |
| 渲染 | `useModelOptions.ts`、`HomeModelMenu.vue`、`HomePage.vue` pill（小改） | 透传 `origin` 到 `ModelChoice` 与图标 |
| 契约 | `.trellis/spec/main-process/pi-provider-contracts.md` → 扩展为 `local-cli-provider-contracts.md`（改名保留旧文件为指针） | 参数矩阵、协议、结束语义、密钥边界、终止 |

## 4. 契约

### 4.1 provider 定义

```ts
type LocalCliOrigin = 'pi-cli' | 'omp-cli' | 'codex-cli' | 'claude-cli'

interface LocalCliProviderDefinition {
  origin: LocalCliOrigin
  providerId: string                 // 'pi-cli-default' 保持不变；'omp-cli-default' 等
  command: string                    // 'pi' | 'omp' | 'codex' | 'claude'
  fallbackCommands?: string[]        // pi: ['pie']
  envOverride: string                // TUFF_PI_CLI_PATH（已有）| TUFF_OMP_CLI_PATH | TUFF_CODEX_CLI_PATH | TUFF_CLAUDE_CLI_PATH
  displayName(resolved: ResolvedCli): string   // pi: 'Pi (local CLI)' | 'Pi · Touch Pie'
  bindingPriority: number            // 99 / 100 / 101 / 102
  listModels(): string[]             // 同步读缓存；空数组 = 该行消失
  warmCatalog(): Promise<void>       // 启动时与 probe 并行
  create(config: IntelligenceProviderConfig): IntelligenceProvider
}

interface ResolvedCli { path: string; form: 'primary' | 'fallback' /* pie */ }
```

### 4.2 运行时

```ts
interface CliRunSpec {
  executable: string
  args: string[]
  env?: Record<string, string>
  stdin: 'ignore'                    // 全部关闭 stdin（codex 否则会等 stdin）
  parseLine(line: string): CliLineEvent | null
  // codex: 无 delta，整段作为一次 delta + 立即 commit
}
interface CliLineEvent {
  delta?: string; model?: string; provider?: string; usage?: IntelligenceUsageInfo
  commit?: boolean; reset?: boolean; failure?: string; done?: boolean; partEvent?: IntelligencePartEvent
}
runCliChat(spec, { signal, attachments }): AsyncGenerator<IntelligenceStreamChunk>
```

- 结束判定：EOF 时「无 committed 文本 且 有 failure」→ throw `<ORIGIN>_CLI_FAILED: <failure>`；
  退出码不作为答案真值（pi §6 的规则推广到全部）。
- claude 的 `result.is_error === true` → failure = `result.result`；`subtype` 忽略。
- codex 的 `item.completed{type:'error'}` 只记录（可能是 metadata 警告，turn 仍可能成功）；`turn.failed` 才是 failure。
- 终止：`CHILD_TERMINATION_GRACE_MS` / `CHILD_FORCE_KILL_TIMEOUT_MS` 与错误码 `<ORIGIN>_CLI_TERMINATION_FAILED` 沿用 pi 值。

### 4.3 argv 矩阵（answer-only）

| origin | argv |
|---|---|
| pi | 现状不变 |
| omp | `-p --mode json --no-tools --no-extensions --no-skills --no-rules --no-session --thinking off --system-prompt <p> [--model <m>] [@file…] <prompt>` |
| codex | `exec --json --ephemeral --skip-git-repo-check --ignore-rules --ignore-user-config? -s read-only -C <tmpdir> --color never -c mcp_servers={} [-m <m>] <prompt>`；系统提示拼进 prompt 前缀（codex exec 无 system-prompt 参数）；`--ignore-user-config` 会丢掉 `model_provider`，**不用**，改用 `-c mcp_servers={}` 只关 MCP |
| claude | `-p --output-format stream-json --verbose --include-partial-messages --no-session-persistence --strict-mcp-config --setting-sources "" --tools "" --disable-slash-commands --no-chrome --system-prompt <p> [--model <m>] <prompt>` |

- `-C <tmpdir>`：codex / claude 的 cwd 用 `os.tmpdir()/tuff-cli-<uuid>`，避免读到 app 启动目录的 AGENTS.md / CLAUDE.md；
  运行后删除。omp 有 `--no-rules`，pi 有 `--no-context-files`，cwd 仍用 tmpdir 统一。
- 附件：pi / omp 走 `@file`；codex `-i <file>` 只支持图片（实现时验证一次）；claude 无附件参数 → 忽略（契约 §2）。

### 4.4 模型目录

| origin | 来源 | 缓存 | 空时 |
|---|---|---|---|
| pi | `~/.pi/agent/{models,models-store}.json` | mtime 签名 | 行消失（现状） |
| omp | `omp models --json --no-extensions`（10 s 超时）→ `models[].selector`；失败 → `models.yml` 的 `providers.<p>.models[].id` 拼 `p/id` | 5 min + 菜单打开时 `load(true)` 触发的刷新（异步，下次读到） | 行消失 |
| codex | `config.toml`：`model`、`profiles.*.model`（去重） | mtime 签名 | `['default']` 一行，显示「Default」，不传 `-m` |
| claude | `['fable','opus','sonnet']` + `~/.claude/settings.json` 的 `model`（若不同） | 无 | 不会为空 |

`getProviderModelOptions` 保持同步：`listModels()` 只读缓存，`warmCatalog()` 在 `probeAll()` 里并行预热；
第一次打开菜单若 omp 预热未完成，则该分栏暂缺，菜单的 `load(true)`（子任务 2 已加）下次打开补上。

### 4.5 身份到渲染

`IntelligenceProviderModelOption.origin` → renderer `ModelChoice.origin` → `providerIconFor(type, origin)`。
图标：pi `i-carbon-bot`（沿用现有 local 图标以外的独立形）、touch-pie 用 `TxTuffLogoStroke` 或品牌 svg、
omp `i-carbon-machine-learning-model`、codex `i-simple-icons-openai`、claude `i-simple-icons-claude`
（uno 校验：simple-icons 含 openai / anthropic / claude；carbon 含 bot / machine-learning-model / terminal）。
safelist 由 `PROVIDER_ICON_CLASSES` 派生，自动覆盖。

### 4.6 模型家族图标（R9）

`modules/intelligence/model-family-icons.ts`（renderer，新，纯函数）：
`modelFamilyIconFor(modelId: string): ITuffIcon | null`，表驱动：`[{ family, test: RegExp, icon }]`，按顺序首个命中；
匹配在 `splitModelId(model).name` 的小写上做（`codex/gpt-6-astra` → `gpt-6-astra` → OpenAI）。
`HomeModelMenu` 行图标 = `modelFamilyIconFor(model) ?? providerIconFor(type, origin)`；分栏按钮只用 provider 图标。
`MODEL_FAMILY_ICON_CLASSES` 派生并入 safelist。测试：每个家族一条 + 回落一条 + safelist 完整性一条。

## 5. 数据流

```
启动: intelligence-module.onInit
  → cliProviderRegistry.probeAll()      // 4 个并行: resolve executable (+pie fallback) + warmCatalog
  → ensureIntelligenceConfigLoaded(true)
      → providers += 每个 resolved 的运行时 config { id, type: LOCAL, name, metadata: { internal, origin } }
      → capabilities['text.chat'].providers += bindings(priority 99..102)
菜单: renderer getProviderModelOptions
  → main: 每个 origin provider → definition.listModels() (sync cache) → option { origin, models }
发送: renderer { preferredProviderId, modelPreference: [model] }
  → strategy: allowedProviderIds=[id] → provider-factory 按 origin → XxxCliProvider.chatStream
      → runCliChat(spec) → chunks (delta / commit / usage / model) → 现有 router 累积与 commit/rollback
```

## 6. 取舍与否决

| 方案 | 结论 |
|---|---|
| 复用 `local-ai-cli` 模块的 app-server / acp / SDK 协议 | 否决：那是带工具与审批的 task 协议，且在 beta 门后；answer-only 用各 CLI 的 print 模式更简单、更快（claude 2 s） |
| claude 走 Agent SDK 拿 `supportedModels()` | 否决（D2）：需起会话，未登录失败；固定别名足够 |
| 给每个 CLI 新的 `IntelligenceProviderType` | 否决：改 tuff-intelligence 枚举 + 所有穷举列表；沿用 `LOCAL + origin` |
| codex `--ignore-user-config` 做隔离 | 否决：会丢掉用户的 `model_provider`（本机是本地代理），改 `-c mcp_servers={}` |
| omp 只读 `models.yml` | 否决为主路径：yml 含 apiKey 且是 omp 内部格式；`omp models --json` 是对外接口。yml 只做回落 |
| 四个 provider 各自复制 pi 的 455 行 | 否决：终止 / abort / 附件逻辑必须单份，否则 §8 契约无法维持 |

## 7. 兼容与回滚

- pi 的 providerId、origin、argv、解析、测试全部不变；抽运行时是纯重构，pi 测试是回归网。
- 新 provider 只在探测到可执行文件时出现；没有 CLI 的机器零变化。
- `IntelligenceProviderModelOption.origin` 可选字段，老 renderer / 插件忽略。
- 回滚粒度：Step 1（重构）可单独保留；Step 2-4 每个 provider 一个 commit，可单独 revert。
