# 本机代理 CLI 探测修复与去门槛

父任务：`.trellis/tasks/10-03-intelligence-settings-revamp`（需求来源：老板提问「本机装的 pi / omp / claude / codex 似乎拿不到」）。调研：`research/detection.md`，行号以 2026-10-03 工作区为准；`M/` = `apps/core-app/src/main/`，`R/` = `apps/core-app/src/renderer/src/`。

## Goal

从 Dock 启动的 Tuff，能正确识别并运行本机装的 pi / omp / codex / claude；macOS 上本机代理功能不再需要环境变量才出现；MCP 发现补上 omp、pi，Codex 不再显示成「config MCP」。

## 已确认的决策（2026-10-03）

- 探测问题和 UI 改版一起修。
- 去掉 `TUFF_ENABLE_LOCAL_AI_CLI` 门槛：macOS 上本机代理功能直接可见。
- **入口时机**：设置区「本机 AI 代理」在 macOS 上始终可见，用来查看探测结果、打开功能。⌘⇧L、CoreBox 按钮、OmniPanel 动作、项目菜单「本机代理」组，都等用户打开总开关 `localAiCli.enabled`（默认关）之后才出现，关掉就收回，快捷键也一起注销。这延续了 08-04 R15「用户在设置里同意」。
- **已接入的 stdio MCP 服务器缺 PATH**：并入本任务（L10）。
- **产品定位**（父任务硬约束）：只复用 CLI 的凭证并调用 CLI，不做 cc-switch 式代理。查找、版本探测、启动都只读 CLI，不改它们的配置。

## 现状

- **主进程有四套独立的查找**（调研 §1.1）：
  - **A** `M/modules/local-ai-cli/executable-resolver.ts`：本机代理全部入口都靠它。
  - **B** `M/modules/ai/providers/cli/cli-executable.ts`：聊天 provider 用，是 `spec/main-process/pi-provider-contracts.md` §11.3.3 的实现。
  - **C** `M/modules/ai/ai-cli-import-service.ts:235`：只查 PATH，结果持久化，但渲染层不显示。
  - **D** `M/modules/ai/intelligence-local-environment.ts:100`：只查 PATH，渲染层没有消费者。
- **A 的误报**，在模拟 Dock 启动的环境（launchd PATH）下用真实代码实测（调研 §1.5）：pi、codex 都被解析成 `~/.local/bin/mise`，版本报成 `2025.10.8`。成因有三层：
  1. 只搜 `~/.local/share/mise/shims`，不搜 `installs/node/*/bin`；
  2. 对候选做 `realpath`，shim 就变成了 mise 本体（`executable-resolver.ts:28-38`）；
  3. 版本正则不认 CLI 身份，`mise --version` 的输出四个都能匹配上（`provider-registry.ts:35,49,63,77`）。
- **B 在同样环境下四个都对**，每个不到 10ms。
- **A 这条链路的四个启动点都用 realpath 后的路径，也不往 PATH 补目录**（调研 §2.1、§2.3）：
  - 版本探测：`executable-resolver.ts:69`
  - 任务：`spawnSafe`，`index.ts:763`
  - 终端：`pty.spawn`，`index.ts:1306`
  - claude SDK：`pathToClaudeCodeExecutable`，`index.ts:616`

  结果是 `#!/usr/bin/env node` 的 CLI（pi、codex 都是）exit 127，用设置里「选择程序」指到正确文件也救不回来。聊天链路会把 `dirname(未解析路径)` 补进 PATH，所以能跑（`cli-process-runtime.ts:153-160`）。
- **门槛**：`index.ts:123-125`，要求 darwin 且 `TUFF_ENABLE_LOCAL_AI_CLI === '1'`。门关时 `getStatus` 不做任何探测，四个 CLI 一律报 `BETA_UNAVAILABLE`，执行类 handler 全部拒绝。
  - 理由写在归档的 08-04 PRD：R15「环境变量不能替代用户设置同意」；R23「Windows / Linux 在 discovery、PTY、进程树清理和真机验收完成前不得显示入口」。
- **去门槛后会打开的东西**（调研 §4.2）：
  - ⌘⇧L 全局快捷键，默认启用，而且与 `localAiCli.enabled` 无关（后者默认 false）；
  - 设置区；
  - OmniPanel 动作和 CoreBox 按钮，这两个只看 `betaAvailable`；
  - 项目菜单「本机代理」组；
  - 执行类 handler。

  另外，CoreBox 挂载、打开项目菜单等时机，都会对四个 CLI 做不带缓存的 `--version` 探测（单次最长 5s）。
- **MCP 发现**（调研 §7）：
  - omp 的 `~/.omp/agent/mcp.json`、pi 的 `~/.pi/agent/mcp.json` 根键都是 `mcpServers`，`parseMcpProfiles` 能读，只是 layouts 表里没登记。
  - config 类文件派生的 MCP 候选名是 `${文件 basename} MCP`（`ai-cli-import-service.ts:509-515`），所以 Codex 的 `config.toml` 显示成「config MCP」。
  - `userMcpFiles` 能自定义名字，只在 user 作用域生效。

## Requirements

- **L1 单一查找**：本机代理改用 B（`resolveCliExecutable`）查找，A 的搜索逻辑删除。
  - 顺序沿用 §11.3.3：`TUFF_<CLI>_CLI_PATH`（权威）→ PATH → 版本管理器根 → 固定 bin。
  - 设置里「选择程序」写入的 `executableOverride` 作为新的一层，排在环境变量覆盖之后、PATH 之前；本机代理和聊天 provider 都认它。
  - 设置覆盖指向的文件失效时，继续往下搜，并在状态里标明「已选程序不可用」。
  - pi 保留 pie 回退（09-06 D1）。
- **L2 不再 realpath，启动时补 PATH**：
  - 版本探测、任务、终端、claude SDK 一律用查找给出的原始路径启动。
  - 子进程 env 都在 PATH 前补 `dirname(原始路径)`，规则与聊天链路的 `runCliChat` 相同（§11.2、09-06 R8）。
- **L3 版本校验认身份**：
  - codex、claude、omp 的版本正则必须匹配到 CLI 自己的标识（如 `codex-cli`、`(Claude Code)`、`omp/`）；匹配不到就判为不可用。
  - pi 的输出只有版本号，没有标识，正则保持现状。由于 L2 之后 shim 不会再被解析成 mise 本体，这一层误报自然消失。
- **L4 缓存与刷新**：
  - 查找结果和版本探测结果都缓存在内存里。
  - CoreBox 挂载、打开项目菜单、OmniPanel 刷新都读缓存，不再每次跑四遍 `--version`。
  - 设置页「刷新」和「选择程序」会清掉对应 CLI 的缓存并重新探测。
- **L5 去掉环境变量门槛**：本机代理的可用性只看 `process.platform === 'darwin'`。Windows / Linux 维持现状，不显示入口（08-04 R23）。macOS 上设置区始终可见。
- **L6 入口与快捷键**：
  - 渲染层入口的条件从「`betaAvailable`」改成「`betaAvailable && enabled`」，涉及 CoreBox 按钮、OmniPanel 动作、项目菜单组和 `localAiAgentChoices`。
  - ⌘⇧L 只在 `localAiCli.enabled` 为真时注册，总开关变化时跟着注册或注销。
  - 设置区只看 `betaAvailable`。
- **L7 MCP 发现**：
  - 登记 omp 的 `~/.omp/agent/mcp.json`，显示名「Oh My Pi MCP」。
  - 登记 pi 的 `~/.pi/agent/mcp.json`，显示名「Pi MCP」。
  - config 类文件派生的 MCP 候选改用代理名命名，Codex 的 `config.toml` 显示为「Codex MCP」。同一代理有多个同名候选时，在名字后追加文件名以作区分。
- **L8 测试**：
  - 为本机代理的状态解析补单测（目前 A 完全没有测试），覆盖：shim 不再误报、设置覆盖失效时继续搜、版本身份校验、缓存与刷新。
  - `index.test.ts`、`index.navigation.test.ts` 的门槛 setup 改成「只看平台」。
  - 渲染层各处 `betaAvailable:false` 的用例改为表达非 macOS 平台。
  - `ai-cli-import-service.test.ts` 补 omp、pi 的 `mcp.json` 和命名用例。
- **L9 spec**：Phase 3 更新 `pi-provider-contracts.md` §11.3.3 与 §11.2，写明以下几点，并注明归档 08-04 设计里「realpath + 常规文件」的要求作废：
  - 设置覆盖这一层的位置与语义；
  - 本机代理与聊天 provider 同源；
  - 所有启动点都补 PATH。
- **L10 stdio MCP 服务器的 PATH**：已接入的 stdio 服务器（`M/modules/ai/intelligence-mcp-registry.ts:321-331`）启动前，先用 L1 同一套搜索根（PATH → 版本管理器根 → 固定 bin）解析裸命令（如 `npx`、`node`、`uvx`）。命中后：
  - 子进程 env 的 PATH 前补「该命令所在目录」和存在的固定 bin 目录，使 `npx` 能找到同目录的 node；
  - 存储里的配置原样不动，只在启动时改用解析出的绝对路径；
  - 解析不到时行为不变。

## Acceptance Criteria

- [ ] 用 launchd 等价环境（打包应用从 Dock / Finder 启动，或 `env -i` 只给 launchd PATH 启动构建产物），设置页「本机 AI 代理」显示：
  - pi 0.84.3、codex 0.158.0、claude 2.1.280、omp 18.4.4（以验收当天的实际版本为准）；
  - 路径都是真实 CLI，不是 `mise`。
- [ ] 同样环境下，本机代理面板分别用 pi、codex 各跑通一条只读任务。
- [ ] 不设任何环境变量时，macOS 上设置区可见；入口和快捷键的行为符合 L6 的决定。
- [ ] MCP 页的发现行显示「Codex MCP」「Oh My Pi MCP」「Pi MCP」。
- [ ] launchd 等价环境下，启用一个 `npx` 启动的 stdio MCP 服务器，「探测」成功。
- [ ] 总开关关闭时，没有 ⌘⇧L、CoreBox 按钮和项目菜单组；打开后出现；再关上又消失，⌘⇧L 也随之注销。
- [ ] core-app `typecheck`（node + web）通过；涉及的单测通过；改动文件的 lint delta 为 0。

## Out of Scope

- C、D 两套只查 PATH 的查找：它们的结果不进 UI，这次不改。
- 不做 cc-switch 式代理（父任务硬约束）：不改写任何 CLI 的配置文件；不替 CLI 切换 provider；不把 Tuff 的设置写回 CLI。
- 以下发现缺口这次不修：opencode 的 MCP 格式、`.claude.json` 项目级服务器、project 作用域 cwd 为 `/`。
- 只有 pie、而 pi 不在 PATH 上的机器：pie 用 `which pi` 会失败（调研 §2.3）。聊天链路也有这个问题，这次不修。
- `09-06-local-cli-model-providers` 任务记录过期（代码已合入，记录仍写「未开始」），不在本任务里整理。
