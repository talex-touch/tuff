# Research: 本机代理 CLI 探测、`TUFF_ENABLE_LOCAL_AI_CLI` 门槛与 MCP 发现缺口

- **Query**: pi / pie / omp / codex / claude 的全部可执行文件查找与启动路径；GUI（launchd）PATH 下的行为；09-06 任务对照；门槛的全部用法与去掉后的影响面；登录 shell / mise 实测；MCP 发现（omp / pi）；涉及的测试。
- **Scope**: mixed（仓库代码 + 本机实测 + 本机已安装工具的包/二进制）
- **Date**: 2026-10-03

约定：
- `M/` = `apps/core-app/src/main/`，`R/` = `apps/core-app/src/renderer/src/`，`U/` = `packages/utils/`。
- 本机路径一律写成 `~/…`。「launchd PATH」= `/usr/bin:/bin:/usr/sbin:/sbin`。
- 实测命令统一形态：`env -i HOME=$HOME USER=$USER PATH=/usr/bin:/bin:/usr/sbin:/sbin SHELL=/bin/zsh …`，`</dev/null`，cwd 先 `cd /`（模拟从 Finder 启动的打包应用，其 `process.cwd()` 为 `/`）。没有用 `timeout` 命令（本机 mise handler 会吞输出），超时交给工具参数。
- **工作区未提交改动**：本文引用的文件里只有 `R/modules/lang/zh-CN.json` 有未提交改动（第 3413 行起插入 7 行 OTA `ready_notice` 文案，与本任务无关）。所以本文引用的 zh-CN.json 行号是工作区行号，比 HEAD 大 7。其余引用文件在调研时都是干净的（`git status --short` 已核对）。

---

## 0. 结论速览

1. 主进程里有 **四套**独立的可执行文件查找（另有一套查的是 `tuff` CLI，与本任务无关）。真正决定「本机代理」能不能用的是 `M/modules/local-ai-cli/executable-resolver.ts`。它在 launchd PATH 下把 pi、codex 都解析成了 `~/.local/bin/mise`，版本号报成 `2025.10.8`，属于误报。原因：先把 mise shim `realpath` 成 mise 本体，再拿 `mise --version` 的输出去匹配一个宽松的版本正则。聊天 provider 用的 `M/modules/ai/providers/cli/cli-executable.ts` 在同样的 launchd PATH 下四个都找得对（§1.5）。
2. 就算路径找对了，「本机代理」这条链路在 GUI 启动下也跑不起 `#!/usr/bin/env node` 的 CLI：路径被 realpath 到 `lib/node_modules/.../cli.js`；版本探测、任务、PTY 都继承 launchd PATH，也没有往 PATH 里补 node 所在目录。实测 exit 127（§2.3）。聊天 provider 那条链路会把「未 realpath 的可执行文件所在目录」补到 PATH 前面，所以能跑（§2.1）。
3. 门槛 `isLocalAiCliBetaAvailable()` 一去掉，以下入口会一起打开：全局快捷键 `CommandOrControl+Shift+L`（默认启用）、设置区「本机 AI 代理」、OmniPanel 动作、CoreBox 按钮、项目菜单「本机代理」组、执行类 handler（§4.2）。其中前四项的可见性只看 `betaAvailable`，不看是否装了 CLI、也不看用户开关（§4.2）。
4. 登录 shell 方案：现有 `-lc` 不读 `~/.zshrc`，mise 恰好在那里激活，所以在本机等于什么都没补。`-ilc` 能补出 pi，但 codex 照样找不到；耗时 0.25–0.5 s；stdout 前面有 16 行 fastfetch 横幅；结果还取决于 cwd（§5、§6）。
5. MCP：omp 的 `~/.omp/agent/mcp.json` 和 pi 的 `~/.pi/agent/mcp.json` 根键都是 `mcpServers`，解析器本身能读，只是 layouts 表里根本没登记这两个文件（§7）。另外还有 opencode 格式不被支持、`.claude.json` 项目级不读、发现时 cwd 取的是 `/`、已接入的 stdio 服务器也继承 launchd PATH 等缺口（§7.7）。

---

## 1. 可执行文件查找（Q1）

### 1.1 总表

| # | 查找 | 位置 | 顺序 | 校验 | 缓存 | 覆盖 | 非 macOS | 消费方 |
|---|---|---|---|---|---|---|---|---|
| A | `resolveLocalAiCliProviderStatus` / `resolveAllLocalAiCliProviderStatuses` | `M/modules/local-ai-cli/executable-resolver.ts:81-117` | 设置覆盖 → `PATH` + 固定目录 → 登录 shell `-lc` | `realpath` + 常规文件 + `X_OK`（28-38），再跑 `--version` 并匹配正则（63-79） | 无，每次调用都重新探测 | `localAiCli.providers[id].executableOverride`；无效时**继续往下搜** | 无 PATHEXT；登录 shell 仅 darwin（49） | 本机代理全部入口（§1.2） |
| B | `resolveCliExecutable`（经 `pi-cli-runtime.ts` 包装） | `M/modules/ai/providers/cli/cli-executable.ts:143-209` | `TUFF_<CLI>_CLI_PATH` → `PATH` → 版本管理器根 → 固定 bin；主命令全部位置搜完才试 `fallbackCommands` | 只看 `X_OK`（69-76），不 realpath，不探测版本 | 模块级 `Map`，永久记忆（170、178-187） | env 覆盖**权威**：指向无效文件即视为「缺席」（144-148） | win32 用 PATHEXT（78-82）；版本管理器根是 POSIX 路径 | 聊天 provider（§1.3） |
| C | `findExecutable`（仅 PATH） | `M/modules/ai/ai-cli-import-service.ts:235-246` | 只查 `PATH` | 常规文件 + `X_OK`（win32 用 `F_OK`）（216-225） | 无 | 无 | PATHEXT | 导入扫描的 `source.executablePath` / `installed`（607-608、631） |
| D | `findExecutable(command, envPath)` | `M/modules/ai/intelligence-local-environment.ts:100-116` | 只查 `PATH` | 只看 `F_OK`（83-90），不检查可执行位 | 无 | 无 | PATHEXT | 只给 `getLocalEnvironment` 事件用（`M/modules/ai/intelligence-module.ts:1983-1990`），渲染层**没有消费者**（全仓 grep 只命中 SDK 与测试） |

其余 grep 命中都与 CLI 无关：`M/modules/box-tool/addon/apps/win.ts:222` 是 Windows 应用索引；`M/modules/platform/capability-adapter.ts:264-288` 探测的是 `tuff` CLI（PATH 加开发路径，60 s TTL，1.5 s 超时）。`'which'` 在 main 里只出现在注释中。

### 1.2 A：`local-ai-cli/executable-resolver.ts`

- 固定目录（16-26）：先 `process.env.PATH`，再依次 `/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin`、`~/.bun/bin`、`~/.local/share/mise/shims`。**不含** `~/.local/share/mise/installs/node/*/bin`。
- `validateExecutable`（28-38）对候选做 `realpath`，返回的是**规范路径**。后面的版本探测、任务、PTY 用的都是这个规范路径。
- 登录 shell（48-61）：仅 darwin；`SHELL === '/bin/bash'` 时用 bash，否则一律 `/bin/zsh`（50）；执行 `['-lc', 'command -v <cmd>']`，3 s 超时（14、53），`maxBuffer` 4096，只取 stdout 最后一行（56）。`<cmd>` 只会来自固定注册表（`M/modules/local-ai-cli/provider-registry.ts:30-87`）。
- 版本探测（63-79）：`execFileSafe(path, ['--version'])`，5 s，不传 `env`，所以继承 Electron 的环境。stdout 与 stderr 拼起来匹配 `definition.versionPattern`。`execFileSafe` 遇到非零退出码会 reject（`U/common/utils/safe-shell.ts:82-101`）。
- 判定 `installed = Boolean(executablePath && version)`（95）；不可用时 `issueCode: 'PROVIDER_UNAVAILABLE'`（102）。
- 四个版本正则都不认 provider 身份：pi `/^\d+\.\d+\.\d+/m`（provider-registry.ts:35）、codex `/(?:codex-cli\s+)?\d+\.\d+\.\d+/i`（49）、claude `/\d+\.\d+\.\d+(?:\s+\(Claude Code\))?/i`（63）、omp `/(?:omp\/?|omp v)?\d+\.\d+\.\d+/i`（77）。`mise --version` 的输出 `2025.10.8 macos-arm64 (2025-10-13)` 四个都能匹配上。
- 注册表里没有 `pie`，pi 只认 `pi` 这一个命令（provider-registry.ts:31-34）。
- 调用方（都在 `M/modules/local-ai-cli/index.ts`）：
  - `getStatus` → `resolveAllLocalAiCliProviderStatuses`（438-443），由 `LocalAiCliEvents.status.get`（289-292）对外提供。
  - `locateProvider`（446-462）：主进程弹文件对话框，选中的路径（非规范路径）写进 `executableOverride`（459），随后立刻重新解析（461）。
  - `requireRunnableProvider`（464-482），被 `runTask`（733）和 `createTerminal`（1297）使用。
- 渲染层消费 `status.get` 的地方：`R/views/base/settings/SettingLocalAiCli.vue:127-137`、`R/views/omni-panel/OmniPanel.vue:202`、`R/views/box/CoreBox.vue:216-222`、`R/stores/projects.ts:104-117`（项目菜单）、`R/views/omni-panel/components/LocalAiCliPanel.vue`（`runnableProviders` 65-67）。

### 1.3 B：`ai/providers/cli/cli-executable.ts`

- 版本管理器根（48-55）：`~/.local/share/mise/installs/node`、`~/.volta/tools/image/node`、`~/.nvm/versions/node`、`~/.fnm/node-versions`。展开成 `<root>/<version>/bin`，按 `.sort().reverse()` 排序（100-112）。这是**字典序**，不是 semver；目录项里的符号链接也算（104）。
- 固定 bin（57-67）：`~/.local/bin`、`~/.bun/bin`、`~/.deno/bin`、`~/.npm-global/bin`、`/opt/homebrew/bin`、`/usr/local/bin`。
- 查找顺序（143-167）：env 覆盖 → 对 `[command, ...fallbackCommands]` 逐个查：先 `PATH`；PATH 没命中时才展开版本管理器根与固定 bin，且只展开一次（151-159）。
- 四个 lookup 定义在 `M/modules/ai/providers/pi-cli-runtime.ts`：pi `{command:'pi', fallbackCommands:['pie'], envOverride:'TUFF_PI_CLI_PATH'}`（74-78）、omp `TUFF_OMP_CLI_PATH`（118-121）、codex `TUFF_CODEX_CLI_PATH`（136-139）、claude `TUFF_CLAUDE_CLI_PATH`（154-157）。
- 缓存：`undefined` 表示未探测，`null` 表示已探测且缺席（198-209）。`resetAllCliExecutableCaches`（pi-cli-runtime.ts:172-177）和 `resetPiExecutableCache`（90-92）**只有测试在调用**，生产代码里没有任何地方会重新探测，所以 App 运行期间新装的 CLI 要重启才能被认到。
- 调用方：
  - 启动时 `probeLocalCliProviders`（`M/modules/ai/intelligence-module.ts:876-898`）。它在首次 `ensureIntelligenceConfigLoaded(true)` 之前被 `await`（768-773），所以耗时直接算进 Intelligence 模块的初始化。
  - 配置组装：同步读 `getResolved*` 注入 4 个运行时 provider，并补 `text.chat` 绑定（`M/modules/ai/intelligence-config.ts:1179-1207`）。
  - 模型菜单：`resolveDeclaredModels`（`M/modules/ai/intelligence-provider-model-options.ts:91-105`），`=== null` 时该行消失。
  - 实际执行：`PiCliProvider.chatStream`（`M/modules/ai/providers/pi-cli-provider.ts:243-266`）。
- 这一套不受门槛约束：`provider-factory.ts:20` 按 `isCliAgentProviderConfig` 统一走 `PiCliProvider`。

### 1.4 C / D 的补充

- C 的 `installed` 还会被「找到任何候选」置为 true（`ai-cli-import-service.ts:631`）。这个值会持久化进 orchestrator store（`M/modules/ai/ai-orchestrator-store.ts:604-605`），但渲染层不显示。
- D 只查 codex、claude（`intelligence-local-environment.ts:397-402`），不查 pi、omp。

### 1.5 实测：launchd PATH、cwd `/`

| CLI | A：`executable-resolver.ts`（主会话的 `/tmp/tuff-cli-probe/probe.cjs`，本次复跑结果一致） | B：`cli-executable.ts`（用 Node 26 直接 import 真实 `.ts` 源文件） |
|---|---|---|
| pi | `~/.local/bin/mise`，`2025.10.8` ✗误报 | `~/.local/share/mise/installs/node/24.9.0/bin/pi`，primary，8.8 ms ✓ |
| codex | `~/.local/bin/mise`，`2025.10.8` ✗误报 | `~/.local/share/mise/installs/node/24.18.0/bin/codex`，6.3 ms ✓ |
| claude | `~/.local/share/claude/versions/2.1.280`，`2.1.280 (Claude Code)` ✓ | `~/.local/bin/claude`，6.7 ms ✓ |
| omp | `~/.bun/bin/omp`，`omp/18.4.4` ✓ | `~/.bun/bin/omp`，7.8 ms ✓ |

本机的相关事实：
- `~/.local/share/mise/shims/{pi,pie,codex,node,npm,npx}` 都是指向 `~/.local/bin/mise` 的符号链接。`~/.local/bin/mise` 是 2025.10.8；另有 Homebrew 装的 `/opt/homebrew/bin/mise`，版本 2026.9.7。
- pi、pie 只装在 node 24.9.0 下，codex 只装在 node 24.18.0 下。
- `~/.local/share/mise/installs/node/` 里还有别名目录 `latest→26.9.0`、`lts→22.23.3`、`lts-jod→22.23.3`，以及 `24`、`24.9` 等短名链接。按字典序倒排，`lts-jod`、`lts`、`latest` 会排在所有数字目录前面；而 `24.9.0` 又排在 `24.18.0` 前面。这两点在本机都没有改变解析结果。
- `/opt/homebrew/bin/node` 是 Homebrew node 26.8.2。
- `~/.local/bin/pie` 是一个 sh 包装脚本：用绝对路径的 node 24.9.0 去执行一个开发目录里的 `pie.mjs`。

A 误报的完整成因：PATH 和前四个固定目录都没有 `pi` → 命中 `~/.local/share/mise/shims/pi`（executable-resolver.ts:24）→ `realpath` 得到 `~/.local/bin/mise`（30）→ `mise --version` 退出码为 0，输出 `2025.10.8…` 匹配上 `^\d+\.\d+\.\d+`（provider-registry.ts:35）→ `installed:true`，`executablePath` 为 mise 本体。之后任务会执行 `mise --mode rpc …`，终端会执行 `mise --no-tools …`，两者都是错的。

---

## 2. 启动路径与子进程环境（Q2）

### 2.1 各功能的启动方式

| 功能 | 启动 API | 可执行文件形态 | env | cwd | 往 PATH 补目录？ |
|---|---|---|---|---|---|
| 本机代理任务：pi / omp / codex | `spawnSafe(status.executablePath!, spec.args, …)`，`M/modules/local-ai-cli/index.ts:763-767`；argv 与 stdin 协议来自 `createLocalAiCliTaskSpec`（provider-registry.ts:98-199） | A 给出的 **realpath 规范路径** | `sanitizedChildEnv()` = 整份 `process.env` 只去掉 `ELECTRON_RUN_AS_NODE`（index.ts:154-161） | Tuff 工作区目录或项目根（`resolveLocalAiCliExecution` 497-535） | **否** |
| 本机代理任务：claude | `@anthropic-ai/claude-agent-sdk` 的 `query({ options: { pathToClaudeCodeExecutable: executablePath, cwd, … } })`（index.ts:591-651，路径在 616） | 规范路径 | 不传；SDK 0.2.141 默认 `env:H={...process.env}`。路径不以 `.js/.mjs/.ts/.tsx/.jsx` 结尾时按原生二进制直接执行，否则用 `node`/`bun` 跑，解释器从 PATH 解析（sdk.mjs 中的 `Fx()` 与 `executable:$.executable??(e0()?"bun":"node")`） | 同上 | **否** |
| 本机代理终端 | `pty.spawn(status.executablePath!, terminalArgs(...), { name:'xterm-256color', cols, rows, cwd, env: sanitizedChildEnv() })`（index.ts:1306-1320） | 规范路径 | 同上 | 同上 | **否** |
| 版本探测 | `execFileSafe(path, ['--version'])`（executable-resolver.ts:69-72） | 规范路径 | 继承 | 继承（GUI 下为 `/`） | **否** |
| 聊天 provider（pi / omp / codex / claude） | `runCliChat` → `spawn(spec.executable, args, …)`（`M/modules/ai/providers/cli/cli-process-runtime.ts:150-161`） | B 给出的**原始路径**（不 realpath） | `{...process.env, PATH: dirname(executable) + PATH, ...spec.env}`（153-160）；`spec.env` = `PI_RETRY_STALL_TIMEOUT_MS:'0'`，pi 有工具时再加工具网关的 URL/token（pi-cli-provider.ts:452-460） | codex/claude 用 `mkdtemp(tmpdir()/tuff-cli-*)`（296-297、421）；pi 原生会话用项目根；其余继承 main 的 cwd | **是**，只补 `dirname(spec.executable)`（158） |
| 已接入的 MCP stdio 服务器 | `new StdioClientTransport({ command, args, cwd, env })`（`M/modules/ai/intelligence-mcp-registry.ts:321-331`） | 配置原文（例如 `npx`） | SDK 1.30.0 只继承白名单 `HOME/LOGNAME/PATH/SHELL/TERM/USER`，再合并配置里的 env（`@modelcontextprotocol/sdk/dist/cjs/client/stdio.js:31,72-82`；`resolveStdioEnv` 428-443） | 配置原文 | **否** |

全仓里往 PATH 补目录的只有 `cli-process-runtime.ts:158` 这一处（对 `M/` 搜 `process.env.PATH` / `PATH:` 已核对）。

### 2.2 补充

- `M/modules/terminal/terminal.manager.ts:202` 是通用的 piped-stdio 执行器，和本机代理无关。项目菜单「在本机代理中打开」走的是 `omniPanelShowEvent`，source 为 `project-local-ai`，进 LocalAiCliPanel 后再调 `runTask` / `createTerminal`（`R/components/shell/ShellConversationList.vue:85-91`）。
- `M/modules/ai/pi-agent-runtime-host.ts:305-323` 用的是进程内 pi-agent-core worker（`utilityProcess.fork`），不是 pi CLI。它的 env 白名单里包含 `PATH`。

### 2.3 GUI 启动现在能不能跑 `#!/usr/bin/env node` 的 CLI？

实测对象是 `~/.local/share/mise/installs/node/24.9.0/bin/pi`，其 realpath 为 `…/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`，首行是 `#!/usr/bin/env node`。

| 运行方式 | 结果 |
|---|---|
| 执行规范路径，PATH 为 launchd | rc=127，`env: node: No such file or directory` |
| 执行规范路径，PATH 前补 `dirname(规范路径)` | rc=127（该目录里没有 node） |
| 执行规范路径，PATH 前补 `dirname(符号链接路径)` = `…/24.9.0/bin` | rc=0，`0.84.3` |

由此可得：
- **聊天 provider：能跑**。B 返回的是 bin 目录里的符号链接，`runCliChat` 把这个目录补到 PATH 前面，而 node 就在同一目录。`/opt/homebrew/bin/<cli>` 的情况同理，因为那里也有 node。
- **本机代理（任务 / 终端 / 版本探测）：不能跑**。路径已被 realpath，env 也没补 PATH。即使用户在设置里用「选择程序」指到正确文件，覆盖路径同样会被 realpath（executable-resolver.ts:87-89），版本探测失败，结果仍是 `installed:false`。
- **claude（SDK）**：本机 claude 是原生 Mach-O，不受影响；若用户的 claude 是 npm 安装（realpath 后是 `cli.js`），SDK 会用 PATH 里的 `node` 去跑，在 launchd PATH 下会失败。
- **pie 回退**：`~/.local/bin/pie` 用绝对路径启动 node，所以 pie 本身能起来；但 `pie.mjs` 用 `which pi` 找 pi（`…/node_modules/@talex-touch/touch-pie/bin/pie.mjs:27-40`）。在 `runCliChat` 给它的 PATH 下（`~/.local/bin` + launchd）实测 rc=1，输出 `FAIL PATH 中找不到 pi；运行 pie 前请先安装 pi`。
- 原生二进制（`~/.local/share/claude/versions/2.1.280`、`~/.bun/bin/omp`）两条链路都能跑。launchd PATH 下 `--version` 分别耗时 0.011 s、0.043 s。

已用一个从 Dock 启动的第三方 GUI 应用做旁证：`ps -E` 显示其 `PATH=/usr/bin:/bin:/usr/sbin:/sbin`、`SHELL=/bin/zsh`，共 11 个环境变量；`launchctl getenv PATH` 为空。`/Applications/tuff.app`（2.4.14-beta.55）已安装但调研时未运行，没能直接取它的环境。

---

## 3. 既有任务 `09-06-local-cli-model-providers`（Q3）

### 3.1 记录与代码不一致

`task.json` 仍是 `status: in_progress`，`meta.blocker` 写着「implementation and runtime acceptance have not started」，AC1–AC9 全部未勾（`.trellis/tasks/09-06-local-cli-model-providers/task.json`、`prd.md:96-112`）。`base_branch` 也还停在 `release/ota-transport-error-classification-20260904`。但代码早已合入：

| 提交 | 内容 |
|---|---|
| `efee7aa33` 2026-09-06 | 抽出 `cli-process-runtime.ts` 和 `cli-executable.ts`，加入 pie 回退 |
| `f9d4d309e` 2026-09-16 | omp / codex / claude 的模型目录与菜单指示 |
| `5178433da` 2026-09-16 | 补完 codex / claude / omp 的运行链路，加 `claude-stream-json.ts`、`codex-exec-json.ts` |
| `fba17769f` 2026-09-17 | 按契约收紧失败语义 |

### 3.2 设计与实现对照

| 设计 | 现状 |
|---|---|
| 共享运行时 `cli-process-runtime.ts`（design.md:25） | ✓ 已实现 |
| 通用解析 `cli-executable.ts` + pie 回退（design.md:26，implement.md:17-19） | ✓ 已实现（cli-executable.ts、pi-cli-runtime.ts:68-78） |
| 每个 CLI 各一个 provider 类，外加 `cli-provider-registry.ts`（design.md:30、34） | ✗ 改成单个 `PiCliProvider` 按 `isOmp/isCodex/isClaude` 分支（pi-cli-provider.ts:230-260）；没有 registry |
| omp 目录以 `omp models --json` 为主（prd.md R3，design.md:32） | ✗ 只读文件 `models.yml/.yaml/.json` + `config.yml` 的 `enabledModels`（`M/modules/ai/providers/pi-model-catalog.ts:81-116`）；全仓搜不到 `omp models` 调用 |
| `IntelligenceProviderModelOption.origin` 双镜像（prd.md R2） | ✗ 两份镜像都没有该字段。渲染层改用 `providerIconForId` 按 seeded id 取图标，注释写明「origin 待落地」（`R/modules/intelligence/provider-icons.ts:57-90`） |
| 显示名「Pi · Touch Pie」（D1） | ✗ `PI_CLI_PROVIDER.name` 固定为 `'Pi (local CLI)'`（`intelligence-config.ts:106-109`）；`getResolvedPiForm()` 只在启动日志里用到（intelligence-module.ts:892） |
| 模型家族图标（R9） | ✓ `R/modules/intelligence/model-family-icons.ts` |
| 契约文档 | 没有另起 `local-cli-provider-contracts.md`，而是把 `.trellis/spec/main-process/pi-provider-contracts.md` 扩出 §11（365 行起） |

### 3.3 本任务必须遵守的既有决定 / 契约

- **D3**：聊天 provider「找到即注册，不受 `TUFF_ENABLE_LOCAL_AI_CLI` 门限制（该门管的是工具调用 / 终端模式）」（09-06 prd.md:63-64）。现状一致，ungated。
- **D1**：pie 是 pi 的安装形态。找不到 pi 才用 pie，目录仍读 `~/.pi/agent`（prd.md:58-59）。
- **R8**：子进程 env 沿用 pi 的净化方式——PATH 补 bin 目录，不透传工具网关变量（prd.md:93-94）。
- `pi-provider-contracts.md` §11.3.3（467-479）：
  - 顺序为 `TUFF_<CLI>_CLI_PATH` → PATH → 版本管理器根 → 固定 bin；
  - **覆盖是权威的**，无效即视为缺席，这也是 AC7 用 `/nonexistent` 模拟「未安装」的依据；
  - `undefined`（未探测）≠ `null`（缺席）；
  - pie 是回退形态。
- §11.3.5（504-510）：启动探测**只打一行 info**，只写名字或 `absent`，不写路径（路径里带用户名）。
- §11.2（404-410）：`env` 是叠加在继承环境之上的额外变量，PATH 会补上可执行文件所在目录。这一条被列为契约的一部分。
- §11.5（538-539）：查找相关的测试必须覆盖「覆盖优先 / 覆盖无效即缺席 / pie 回退 / 版本管理器根 / 缓存重置」。
- 本机代理这一侧的原始设计（归档 `.trellis/tasks/archive/2026-08/08-04-local-ai-cli-quick-invoke/design.md:126-142`）：
  - 顺序：已校验的持久化覆盖 → PATH → 有界的 macOS 常见根（含 mise shims）→ **一次**有超时的登录 shell `command -v` → 「选择程序」对话框；
  - 每个候选都要 resolve symlinks 并要求是常规可执行文件，再做有界 `--version` 探测、校验 provider 特有的输出形态；
  - 只在内存里缓存校验过的路径与版本；
  - 「never log full home-relative paths outside local diagnostic UI」；
  - 登录 shell 命令里不得拼接任何用户字符串。
  - 当时的实测记录（prd.md:20）里 pi 位于 `…/node/24.18.0/bin/pi`。

### 3.4 重叠与冲突

- 两个任务都要改 CLI 查找。09-06 仍是 in_progress；有人续做的话，会和本任务在 `cli-executable.ts`、`pi-cli-runtime.ts`、`intelligence-config.ts` 上撞车。
- 08-04 设计要求的「realpath + 常规文件」，恰恰同时破坏了 shim 的 argv[0] 分派和 env-node CLI 依赖的「node 在同一目录」。两条既有契约在这里直接冲突，修复时绕不开。
- 两套覆盖机制语义相反：A 用设置项，无效时继续往下搜，有 UI；B 用环境变量，权威，GUI 下基本设不了。
- 归档任务 `09-26-sidebar-actions-polish/prd.md:52` 记录了老板 2026-09-26 的决定：「Beta 未开启时整组隐藏」，渲染层据此实现了 `betaAvailable === false` 才隐藏的逻辑。本次去门槛会改变这个前提。

---

## 4. 门槛 `TUFF_ENABLE_LOCAL_AI_CLI`（Q4）

### 4.1 全部用法

- **定义**：`M/modules/local-ai-cli/index.ts:123-125`，`process.platform === 'darwin' && process.env.TUFF_ENABLE_LOCAL_AI_CLI === '1'`。
- **main 侧使用点**（同一文件）：
  - 269-278：注册快捷键；
  - 400：`returnToPanel`；
  - 416-437：门关时 `getStatus` 直接返回 `betaAvailable:false`，所有 provider 都是 `installed:false, issueCode:'BETA_UNAVAILABLE'`，能力全 false，**不做任何探测**；
  - 438-443：门开时才真正探测；
  - 447：`locateProvider` 抛 `LOCAL_AI_CLI_BETA_UNAVAILABLE`；
  - 468：`requireRunnableProvider` 抛同一错误，覆盖 `runTask` 和 `createTerminal`；
  - 1244：`pasteBack` 返回 `target-unavailable`。
- **共享类型**：`U/transport/events/local-ai-cli.ts:37`（`LocalAiCliErrorCode` 里的 `'BETA_UNAVAILABLE'`）、`:125`（`LocalAiCliStatus.betaAvailable: boolean`）。
- **渲染层**：
  - `R/views/base/settings/SettingLocalAiCli.vue:29,159`：整个区块 `v-if="visible"`；
  - `R/views/omni-panel/OmniPanel.vue:202-217`：动作按 `order:-1` 插入；
  - `R/views/box/CoreBox.vue:84,216-222,771,1346-1351`：挂载时读一次；
  - `R/stores/projects.ts:23,109,131-137`；
  - `R/modules/conversation/local-ai-agents.ts:45-49`：`isLocalAiCliStatus` 要求 `betaAvailable` 是 boolean；`:76-77`：`!betaAvailable` 时返回空列表；
  - `R/components/shell/ShellProjectFolder.vue:111-121,286-289`：只有 `localAiBetaAvailable !== false` 才显示整组。
- **测试**：见 §8。
- **文档 / Nexus / CI**：`rg --hidden` 搜 `.github`、`docs`、`apps/nexus/content`，**无命中**。
- **Trellis 记录**：
  - `10-03-intelligence-settings-revamp/prd.md:27`（本次决定去门槛）；
  - `09-06-local-cli-model-providers/prd.md:43,63`；
  - 归档 `08-04-local-ai-cli-quick-invoke/prd.md:44,78`、`design.md:41`、`implement.md:33,155`；
  - 归档 `09-26-sidebar-actions-polish/prd.md:52`。

### 4.2 去掉门槛后会打开的东西（darwin）

1. **全局快捷键** `local-ai-cli.quick-open` = `CommandOrControl+Shift+L`，回调 `omniPanelModule.showLocalAi()`（index.ts:269-278；`M/modules/omni-panel/index.ts:933-939` 本身不设门）。
   - 注册时带 `enabled: true`；按快捷键契约，新记录默认启用（`.trellis/spec/main-process/global-shortcut-contracts.md:58-63`）。
   - `registerMainShortcut` 的返回值不代表系统是否真的接受了这个键（同文件 100-102）。
   - 全仓没有别的地方用这个组合键。
   - 它的注册**与** `localAiCli.enabled` **无关**，而后者默认是 false（`U/common/storage/entity/app-settings.ts:231-240`）。
2. **设置区**「本机 AI 代理」：位于 `R/views/base/settings/categories/SettingIntelligencePage.vue:39`，带「macOS Beta · 本机进程」标签（zh-CN.json `settingLocalAiCli.betaLabel`）。
3. **OmniPanel 动作**「交给本机代理」：判断条件只有 `betaAvailable`。
4. **CoreBox 按钮**：条件同样只有 `betaAvailable`，不管是否装了 CLI、用户是否开启。
5. **项目菜单「本机代理」组**：包括「在本机代理中打开」子菜单和「接管本机会话」（ShellProjectFolder.vue:289-345）。子菜单会对每个 CLI 显示阻塞原因（「未安装」「未开启」等）。
6. **执行类 handler 放行**：`locate`、`task.stream`、`terminal.create`、`returnToPanel`、`pasteBack`。执行仍需要 `settings.enabled` 和 provider 开关都为 true（index.ts:469-473）。用户没开时，`LocalAiCliPanel` 显示「打开设置」空态（LocalAiCliPanel.vue:202-204、470-472）。
7. **探测成本**：门关时 `getStatus` 一次 CLI 都不探测（`R/stores/projects.ts:131-133` 的注释写明了这一点）。门开后，以下每个时机都会对四个 CLI 各跑一次 `--version`（最多 5 s）；PATH 和固定目录都没命中的 CLI 还要再跑一次最长 3 s 的 `-lc`（A 没有缓存）：
   - CoreBox 挂载（CoreBox.vue:771）；
   - OmniPanel 挂载或刷新（OmniPanel.vue:505-517）；
   - 设置页挂载（SettingLocalAiCli.vue:152-154）；
   - 每次打开项目菜单（ShellProjectFolder.vue:111-115）。

### 4.3 与门槛无关、现在就在运行的部分

- `session.list`、`session.discover`、`session.forget` 三个 handler 不设门（index.ts:318-366）。
- 首页「为你准备」里的会话信号来自 `projectStore.localAiSessions`（`R/modules/home-push/useHomePush.ts:164`；`R/modules/home-push/signals.ts:156-174`），因此不受门槛影响。
- 但续接会话最终要走 `runTask`，这一步受门槛约束。
- 聊天 provider（D3）不受门槛影响。

### 4.4 门槛为什么存在

- 引入提交 `a28e246aa`（2026-08-05）的提交信息只有一行标题：`feat(core-app): add local AI CLI quick invoke`，没有正文。之后 `a307d47c6`、`93e6fe0f0` 只是在测试里设置这个变量。
- 理由写在归档 PRD 里：
  - **R15**：只有 macOS main 启动环境里 `TUFF_ENABLE_LOCAL_AI_CLI=1` 才开放；未开放时设置项、CoreBox 动作、全局快捷键、执行 handler 都不可见或不可用；「环境变量不能替代用户设置同意」（prd.md:44）。
  - **R23**：macOS 首发，Windows / Linux 在 discovery、PTY、进程树清理和真机验收完成前不得显示入口（prd.md:52）。
  - **AC21** 已勾（prd.md:78）。
  - 设计侧：design.md:41 的 Rollout 一行，以及 design.md:95「Evaluate immutable startup Beta availability」。
- 推断（未验证）：08-04 的打包验收（implement.md:155、168）是在带环境变量的情况下启动应用的，这通常意味着从终端启动，应用也就继承了终端的 PATH。所以 launchd PATH 下的探测问题当时很可能没有被覆盖到。

### 4.5 非 darwin

- 门槛函数本身就要求 darwin，所以 Windows / Linux 的入口和 handler 一直是关的，与环境变量无关。
- 如果连平台条件一起去掉：
  - A 没有 PATHEXT，登录 shell 只在 darwin 走（executable-resolver.ts:49）；
  - `ensure-node-pty-helper.cjs` 在 win32 上直接跳过；
  - Node 在 Windows 上不经 shell 执行 `.cmd` 的限制（外部知识，CVE-2024-27980 之后会抛 EINVAL）**未在本仓验证**。
- 聊天 provider 不设平台门槛：B 在 win32 上走 PATHEXT（cli-executable.ts:78-82）。

---

## 5. GUI PATH 策略（Q5）

### 5.1 仓库里现成的东西

整个仓库只有 `executable-resolver.ts:48-61` 一处登录 shell 调用：`-lc` 加单条 `command -v`。没有导入整份环境的 helper；搜 `-ilc`、`shellEnv`、`loginShell`、`fix-path`、`shell-path` 都无命中，根目录和各包的 package.json 里也没有 `shell-env` / `fix-path` 依赖。

### 5.2 实测

本机 shell 配置：
- `~/.zprofile:7-8` 执行 `brew shellenv`，`:13` 把 `~/.local/bin:~/.bun/bin` 加到 PATH 前面；
- `~/.zshrc:53-55` 在 `command -v mise` 成立时执行 `eval "$(mise activate zsh --quiet)"`；
- `~/.zshrc:162-163` 有 `[[ -o interactive ]] && fastfetch`；
- mise 全局默认版本：`~/.config/mise/config.toml:4` 为 `node = "24.9.0"`。

`/bin/zsh <flags> 'command -v pi; command -v codex; command -v node; command -v claude; command -v omp'`：

| 方式 | cwd | 耗时（3 次） | 结果 |
|---|---|---|---|
| `-lc` | `/` | 0.056 / 0.037 / 0.037 s | node=`/opt/homebrew/bin/node`，claude=`~/.local/bin/claude`，omp=`~/.bun/bin/omp`；**没有 pi，没有 codex** |
| `-ilc` | `/` | 0.443 / 0.245 / 0.253 s | stdout 先输出 **16 行 fastfetch 横幅**（带 ANSI 转义，含主机名、内网地址等），之后 pi=`~/.local/share/mise/installs/node/24.9.0/bin/pi`，node=`…/24.9.0/bin/node`，claude、omp 正常；**仍没有 codex**。stderr 两行 `(eval):1: can't change option: zle` |
| `-ilc` | 仓库根（`mise.toml` 钉 node 26.0.0） | 0.494 s | **pi、codex 都没有**；pie=`~/.local/bin/pie`，node=`…/26.0.0/bin/node` |

在 `-ilc` 下 `whence -w` 显示 claude、omp、pi 都是 `command`，没有被 alias 遮蔽；codex 为 `none`。

用分隔标记包住整份环境（`printf "\n__TUFF_ENV_BEGIN__\n"; /usr/bin/env; printf "__TUFF_ENV_END__\n"`）：

| 方式 | 耗时 | 标记前的噪声行 | 变量数 | 名字像凭据的变量（key/token/secret/password/auth） |
|---|---|---|---|---|
| `-lc`（cwd `/` 或仓库） | 0.039 s | 0 | 20 | 3 个 |
| `-ilc`（cwd `/`） | 0.248 s | 16 | 54 | 5 个 |
| `-ilc`（cwd 仓库） | 0.245 s | 16 | 54 | — |

- `-ilc` 拿到的 PATH 会带上当前 cwd 下 mise 激活的 install bin：cwd 为 `/` 时是 `…/node/24.9.0/bin`，在仓库里是 `…/node/26.0.0/bin` 等。结果随 cwd 变化。
- `-lc` 拿到的 PATH 有 `~/.local/bin`、`~/.bun/bin`、`/opt/homebrew/bin` 等，但没有任何 mise install 目录。

### 5.3 交互式 rc 的风险与常见防护

**风险（均为本机实测或可从代码读出）：**
- stdout 有横幅噪声，需要标记才能把真正的输出切出来。现有实现取「最后一行」（executable-resolver.ts:56），对单条 `command -v` 碰巧还能用。
- stderr 有 zle 警告。
- 没有 TTY 时 `-i` 也照样执行全部 rc：oh-my-zsh（`~/.zshrc:24`）、starship、fastfetch。stdin 用 `/dev/null` 可以避免等待输入。
- 首次耗时 0.44 s，在仓库目录里 0.49 s。如果在启动路径上调用，`probeLocalCliProviders` 是被 `await` 的（intelligence-module.ts:768-770）。
- 导入的环境会把用户 rc 里导出的、名字像凭据的变量一并带进来。`sanitizedChildEnv()` 会把整份 `process.env` 传给本机代理子进程（index.ts:154-161），claude SDK 默认也是 `{...process.env}`。
- mise 解析出的版本取决于 cwd。

**参考实现**：本机 VS Code 1.140.0，`/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/node/cliProcessMain.js`。
- `getUnixShellEnvironment` 用 `["-i","-l","-c"]` 启动用户 shell（tcsh/csh 用 `["-ic"]`，pwsh 用 `-Login -Command`）。
- 执行的命令是 `'<process.execPath>' -p '"<mark>" + JSON.stringify(process.env) + "<mark>"'`，并设置 `ELECTRON_RUN_AS_NODE=1`、`ELECTRON_NO_ATTACH_CONSOLE=1`、`VSCODE_RESOLVING_ENVIRONMENT=1`。
- mark 是 12 位随机十六进制，用正则 `mark({.*})mark` 取出 JSON，再删掉上述三个变量和 `XDG_RUNTIME_DIR`。
- 超时默认 10 s（`a=1e4`），可通过 `application.shellEnvironmentResolutionTimeout` 在 1–120 s 之间调整。
- Windows 上跳过；`VSCODE_CLI` 已设置（即从终端启动）时跳过，除非带 `--force-user-env`。

---

## 6. mise 细节（Q6）

以下实测都在 launchd PATH 下进行。

| 命令 | cwd `/` | cwd 仓库（node 26.0.0） |
|---|---|---|
| 直接执行 `~/.local/share/mise/shims/pi --version`（按 argv[0] 分派，不 realpath） | rc0，`0.84.3`，0.288 s | rc1，`mise ERROR No version is set for shim: pi … mise use -g node@24.9.0`，0.018 s |
| `…/shims/codex --version` | rc1，`No version is set for shim: codex … mise use -g node@24.18.0`，0.020 s | rc1，同上 |
| `…/shims/pie --version` | rc0，`Touch Pie v0.1.45`，0.498 s | rc1 |
| `…/shims/node --version` | `v24.9.0`（来自全局默认），0.030 s | `v26.0.0`，0.041 s |
| `~/.local/bin/mise which pi` | `~/.local/share/mise/installs/node/24.9.0/bin/pi`，0.070 s | rc1，`pi is a mise bin however it is not currently active…`，**1.575 s** |
| `mise which codex` | rc1，`codex is a mise bin however it is not currently active…` | rc1 |
| `mise which codex --tool node@24.18.0` | rc0，`~/.local/share/mise/installs/node/24.18.0/bin/codex` | — |
| `mise --version` | `2025.10.8 macos-arm64 (2025-10-13)`，另有 stderr `mise WARN  mise version 2026.10.0 available`（会做版本检查） | — |

要点：
- shim 不经 realpath 直接执行是可以的，但结果取决于子进程的 cwd 和 mise 的全局 / 项目配置。
- 本机代理的项目任务会以项目根为 cwd 启动（index.ts:520-527）。像本仓库这样钉了别的 node 版本的项目，shim 会直接失败。
- shim 失败时退出码为 1，`execFileSafe` 会 reject，因此探测会得到正确的「不可用」，不会误报。
- codex 在任何 cwd 下都不活跃，只有扫描版本管理器根（B 已经这么做）或 `mise which --tool` 才找得到。
- 未实测：mise 对不受信任的项目配置文件的行为（`mise trust`），这可能是 shim 在任意项目目录下运行的另一个失败点。

---

## 7. MCP 发现（Q7）

### 7.1 layouts 表（`M/modules/ai/ai-cli-import-service.ts:73-214`）

| provider | userRoot | user 文件 | user 目录 | project 文件 | project 目录 |
|---|---|---|---|---|---|
| codex（75-98） | `CODEX_HOME` 或 `~/.codex`（79） | `config.toml`（config）、`AGENTS.md` | skills、prompts | `.codex/config.toml`、`AGENTS.md` | `.codex/skills`、`.codex/commands`、`.codex/prompts`、`.agents/skills` |
| claude（99-129） | `~/.claude` | `settings.json`、`CLAUDE.md`；**`userMcpFiles: ~/.claude.json`，名为 `Claude Code MCP`**（117） | skills、commands、agents、rules | `CLAUDE.md`、**`.mcp.json`（kind `mcp`）**（120）、`.claude/settings.json` | `.claude/{skills,commands,agents,rules}` |
| pi（130-152） | `~/.pi/agent`，固定写死（134） | `settings.json`、`models.json`、`AGENTS.md` | skills、prompts | `AGENTS.md`、`.pi/settings.json` | `.pi/skills`、`.pi/prompts` |
| oh-my-pi（153-184） | `~/.omp/agent`，固定写死（157） | `config.yml`、`settings.json`、`AGENTS.md`、`SYSTEM.md` | skills、commands、rules、prompts、instructions | `.omp/config.yml`、`.omp/settings.json`、`.omp/AGENTS.md`、`.omp/SYSTEM.md` | `.omp/{skills,commands,rules,prompts,instructions}` |
| opencode（185-212） | `~/.config/opencode` | `opencode.json`、`opencode.jsonc`、`AGENTS.md` | skills、commands、agents、rules | 同 user | `.opencode/{…}` |

**pi 和 omp 都没有登记任何 `mcp.json`。** 另外，导入服务的 pi / omp 根目录是写死的，不认 `PI_CODING_AGENT_DIR` / `TUFF_OMP_AGENT_DIR`；而模型目录读取（`pi-model-catalog.ts:70,201`）和原生会话发现（`M/modules/local-ai-cli/native-session-discovery.ts:496-500`）都认这两个变量。

### 7.2 解析与命名

- `parseMcpProfiles`（`M/modules/ai/ai-import-config-parser.ts:237-295`）：
  - 根键按 `mcp_servers` → `mcpServers` → `mcp` 的顺序取第一个是对象的（238-241）；
  - 每个条目必须**恰好**有字符串 `command` 或合法 http(s) `url` 二者之一（246-251）；
  - 若声明了 `type`，只接受 `stdio | http | streamable-http | sse`（256-262）；
  - `env` 和 `headers` 里只保留字符串值。
- 候选的命名：
  - `candidateName`（392-398）：有 frontmatter `name` 就用它；文件名是 `SKILL.md` 时取父目录名；否则取「去掉扩展名的文件名」。
  - `kind === 'config'` 的文件如果含有 MCP，会**额外**生成一个 id 为 `${base.id}:mcp`、名为 **`${base.name} MCP`** 的候选（509-515）。所以 codex 的 `config.toml` 显示为 `config MCP`，`settings.json` 显示为 `settings MCP`。
  - `kind === 'mcp'` 的文件直接用 `base.name`，没有后缀。项目级 `.mcp.json` 因此显示为 `.mcp`。
  - `userMcpFiles` 通过 `nameOverride` 指定名字，`.claude.json` 显示为 `Claude Code MCP`。
- `sourceKey = mcp:${relative(source.rootPath, canonicalPath)}`（513）。
- 找不到可支持的 profile 时，候选会带上 `blockingIssues`「No supported MCP stdio or HTTP profile was found in this configuration」（520-522）。

### 7.3 `userMcpFiles` 的支持范围

- 类型定义在 `SourceLayout.userMcpFiles`（48），目前**只有 claude** 用到（117）。
- `scanSource` 对这类文件逐个 `buildCandidate(source, 'mcp', file.path, dirname(file.path), file.name)`，约束根是文件所在目录（618-621）。
- `preview` 只在 **user 作用域**的扫描里传入它（677）；project 扫描（679-687）不传。
- 读取上限 2 MiB（`M/modules/ai/ai-import-bounded-file.ts:5,37-38`）。本机 `~/.claude.json` 约 59 KB。

### 7.4 渲染层「MCP 服务器」组（`R/views/base/settings/SettingSkillsMcp.vue`）

- 数据来源：
  - `refreshDiscovery` 调 `aiClient.orchestratorPreviewImport({})`（386-396）→ main `intelligenceOrchestratorEvents.previewImport`（intelligence-module.ts:2017-2019）→ `aiCliOrchestrator.previewImport`（`M/modules/ai/ai-cli-orchestrator.ts:1419-1420`）→ `aiCliImportService.preview`。
  - 已接入的条目来自 `orchestratorGetSnapshot().importedItems`（355-368）。
- 已接入行（801-845）：标题 `displayName` = `alias || name`（179-181）；chip「导入」或「手动」（808-814）、传输方式、探测状态；有探测按钮和开关。
- 发现行（851-872）：
  - 过滤条件：`kind==='mcp' && state==='added' && blockingIssues.length===0 && serverNames.length>0`（202-210）；
  - 标题 `candidate.name`；描述「发现 N 个服务器 · 名称」；
  - chip「本机发现」+ `agentLabel(candidate.provider)`（188-191，取 `settings.skillsMcp.sources.*`，例如 `oh-my-pi` 显示「Oh My Pi」、`pi` 显示「Pi」）+「含敏感值」；
  - 「启用」按钮走 `orchestratorApplyImport`。含敏感值时先 `window.confirm` 再迁入安全存储（403-427）。
- 预览请求不传 `cwd`，所以 project 作用域用的是 `realpath(process.cwd())`（ai-cli-import-service.ts:659）。打包应用从 Finder 启动时是 `/`；开发模式下则是启动目录。

### 7.5 omp 的 MCP 配置（omp 18.4.4，`~/.bun/bin/omp` 为 bun 编译的 Mach-O，下表来自二进制内嵌的 JS 字符串）

- 本机 `~/.omp/agent/mcp.json`（371 B）的结构（只列键和类型）：
  ```
  $schema: str   (= https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json)
  mcpServers: object
    <1 个 server>: { type: "stdio", command: str, args: str[4], timeout: int }
  ```
  根键是 `mcpServers`，`type` 是 `stdio`，所以 `parseMcpProfiles` 能接受。`timeout` 会被忽略。
- omp 自己读取的位置（`strings ~/.bun/bin/omp`）：
  - `{ path: join(cwd, ".omp", "mcp.json"), level: "project" }`、`join(cwd, ".omp", ".mcp.json")`；
  - `join(agentDir, "mcp.json"), level: "user"`、`join(agentDir, ".mcp.json")`；
  - 其中 `ax = ".omp"`，`cs()` 返回 `no.agentDir`，默认 `~/.omp/agent`。
- 另外它还会读「项目根下单独的 `mcp.json` / `.mcp.json`」，以及兼容来源：`.claude.json` 与 `.claude/mcp.json`、`.vscode/mcp.json`、`~/.cursor/mcp.json` 与 `.cursor/mcp.json`、插件市场里的 `.mcp.json`。
- 其中一处校验会因为「unknown top-level field」或「`$schema` 不符」把整个文件判为 disabled。从字符串上下文看，这一处是插件 `mcp.json` 的校验；是否也作用于用户级文件没有确认。
- `~/.omp/agent/config.yml` 的顶层键里没有 mcp 相关的键（已核对键名）。

### 7.6 pi 的 MCP 配置（pi-mcp-adapter 2.6.1，`~/.local/share/mise/installs/node/24.9.0/lib/node_modules/pi-mcp-adapter/README.md`）

- 读取顺序（README:61-66）：`~/.config/mcp/mcp.json` → `<Pi agent dir>/mcp.json`（默认 `~/.pi/agent/mcp.json`；设置了 `$PI_CODING_AGENT_DIR` 时用 `$PI_CODING_AGENT_DIR/mcp.json`，README:37、58）→ `.mcp.json` → `.pi/mcp.json`。项目文件覆盖全局文件（README:321）。
- 格式：根键 `mcpServers`，另有可选的 `settings`、`imports`（兼容 `cursor`、`claude-code`、`claude-desktop`、`vscode`、`windsurf`、`codex`，README:306-317）。
- 每个 server 的字段（README:119-135）：`command/args/env/cwd/url/headers/auth/oauth.*/bearerToken/bearerTokenEnv/lifecycle/idleTimeout/exposeResources/directTools/excludeTools/debug`。`env`、`headers`、`bearerToken` 支持 `${VAR}` / `$env:VAR` 插值。
- 本机 `~/.pi/agent/mcp.json`（382 B）的结构：
  ```
  mcpServers: object
    <server A>: { command: str, args: str[2] }
    <server B>: { url: str, headers: object(1 key), lifecycle: str }
  ```
  `~/.pi/agent/mcp-cache.json` 的顶层为 `{servers, version}`，是工具元数据缓存，不是配置。
- `~/.pi/agent/settings.json` 和 `models.json` 的顶层键里都没有 mcp 根键（已核对键名）。
- 本机不存在 `~/.config/mcp/mcp.json`。

### 7.7 当前已有的其他缺口（实测或从代码读出）

- **opencode**：`~/.config/opencode/opencode.json` 的 `mcp` 条目形态是 `{type:"local", command:<数组>, enabled}`。`type` 不在允许列表里，`command` 也不是字符串（parser 246-262），所以候选总是带着 `blockingIssues`，被渲染层过滤掉。
- **`.claude.json` 的项目级 `projects[<path>].mcpServers`** 不会被读；parser 只看顶层（238）。本机顶层有 5 个，另有 1 个项目条目带自己的 `mcpServers`。
- **数量**：本机 `~/.codex/config.toml` 有 11 个 `[mcp_servers.*]`，发现后合并成一行 `config MCP`。
- **同一份文件可能多处出现**：项目 `.mcp.json` 目前挂在 claude 的 layout 下；omp 和 pi-mcp-adapter 也都读它。
- **启用后的运行**：stdio 服务器的 PATH 只来自 Electron 进程（§2.1）。在 launchd PATH 下，`npx`、`node`、`uvx` 这类裸命令找不到。
- **env 插值**：pi 格式里的 `${VAR}` 会被当成普通字符串原样导入，env 值本身不会被展开（ai-import-runtime.ts:183-189）。

---

## 8. 相关测试（Q8）

| 测试 | 断言或依赖 | 与本任务的关系 |
|---|---|---|
| `M/modules/ai/providers/cli/cli-executable.test.ts` | 69-193：PATH 命中；主命令搜遍所有位置后才回退别名；固定根里的主命令优先于 PATH 上的回退；版本管理器根「newest first」（102-108，仅用 `22.1.0` / `24.2.0`）；无执行位视为忽略；env 覆盖优先 / 无效即缺席 / 按文件名判断形态；缓存语义。195-230：pi 包装与 pie 形态。命令名是合成的，HOME 被重定向（20-57） | B 的契约网 |
| `M/modules/local-ai-cli/index.test.ts` | mock 掉 `./executable-resolver`（69-71）；`beforeEach` 设 darwin + `TUFF_ENABLE_LOCAL_AI_CLI='1'`（624-627），`afterEach` 还原（673-675）；文件内 35 个 describe/it 块都在门开的前提下运行；**没有任何用例断言门关分支**（全仓搜 `LOCAL_AI_CLI_BETA_UNAVAILABLE` 只命中 index.ts） | 去门槛时要改 setup |
| `M/modules/local-ai-cli/index.navigation.test.ts` | 114-131：设置 / 删除该变量，验证导航与面板返回 | 同上 |
| **没有** `executable-resolver.test.ts` | — | A 完全没有直接测试 |
| `M/modules/ai/providers/pi-cli-provider.test.ts` | stub 用 `#!/usr/bin/env node`，通过 `TUFF_PI_CLI_PATH` / `TUFF_CLAUDE_CLI_PATH` 固定路径（45-48、186、433、461-470）。stub 依赖测试进程自己的 PATH，**没有用例在 launchd PATH 下验证 dirname 补 PATH** | `runCliChat` 的事实 oracle（cli-process-runtime.ts:22 写明） |
| `M/modules/ai/providers/pi-cli-provider.home-session.test.ts` | 346-356、748-774：覆盖变量 + `reset*` | 依赖 B 的覆盖语义 |
| `M/modules/ai/providers/pi-cli-reasoning.test.ts` | 153-286：四个 `TUFF_*_CLI_PATH` 的 stub，`resetAllCliExecutableCaches` | 同上 |
| `M/modules/ai/intelligence-provider-model-options.test.ts` | 29-31：mock `getResolvedPiExecutable` | B 的 `undefined/null` 语义 |
| `M/modules/ai/ai-cli-import-service.test.ts` | 90-197：五个 provider 的 user / project 发现；codex `mcp_servers.review`；项目 `.mcp.json` 的 `serverNames: ['local']` 与 `secretKeyPaths`；不泄露秘密。PATH 指向空目录（80、375）。**没有** `.claude.json` / `userMcpFiles` 用例，也没有 pi / omp 的 `mcp.json` 用例 | MCP 缺口要补用例 |
| `M/modules/ai/intelligence-local-environment.test.ts` | 23-63：PATH 指向 `binRoot`，codex 被识别 | D |
| `M/modules/ai/ai-cli-orchestrator.test.ts:127-128` / `intelligence-admin-surface-boundary.test.ts:96,234` | mock 掉导入服务和本地环境 | 一般不受影响 |
| `R/modules/conversation/local-ai-agents.test.ts` | 76-82「offers nothing in a build without local agents」（`betaAvailable:false`）；98-106 `isLocalAiCliStatus` 要求布尔的 `betaAvailable` | 去门槛相关 |
| `R/components/shell/ShellProjectFolder.test.ts` | 198-209「leaves the local-agent group out when … the beta is off」；85 fixture | 同上 |
| `R/components/shell/ShellConversationList.test.ts` | 1341-1356「leaves the whole local-agent group out in a build without the beta」（还断言 `status.get` 只调用一次）；343 fixture | 同上 |
| `R/views/box/CoreBox.{result-switch,refresh-reconcile,search-status}.test.ts` | 47 / 62 / 81：mock `getStatus → { betaAvailable: false }` | 字段若删或改名，要跟着改 |
| `R/views/omni-panel/LocalAiCliPanel.session.test.ts` | 130-135：fixture `betaAvailable: true` | 同上 |
| `R/views/base/settings/SettingSkillsMcp.mount.test.ts` | 163-171：发现行显示「Discovered Claude MCP」+ chip + 启用按钮 | MCP 发现 UI |
| `R/views/base/settings/categories/SettingIntelligencePage.test.ts` | 66-83：`SettingLocalAiCli` 被挂载（组件本身被 mock） | — |
| **没有** `SettingLocalAiCli` 的测试 | — | — |
| `R/modules/lang/shortcut-labels.test.ts` | 两种语言都要有 `local-ai-cli.quick-open` 的标签（global-shortcut-contracts.md:816-818） | 快捷键保留就不受影响 |

---

## 对规划的影响（约束与风险，不含方案）

1. **两套查找的结论在本机相反**：B 四个全对，A 把 pi / codex 误报成 mise。A 的问题有三层：
   - 搜索范围：只有 shims，不扫 installs；
   - 规范化：realpath 之后，shim 的 argv[0] 分派和 env-node 需要的「同目录 node」都丢了；
   - 版本校验：正则不认 provider 身份，`mise --version` 四个都能匹配。

   只改搜索范围不够。本机代理的版本探测、任务、PTY、claude SDK 四处都以规范路径和未补 PATH 的 env 启动（§2.1），同样需要处理。
2. **既有契约互相冲突**：08-04 设计要求 realpath + 常规文件，并要求日志不带家目录路径（design.md:134-140）；09-06 / spec §11 要求覆盖权威、未探测≠缺席、pie 回退、启动日志只写名字（pi-provider-contracts.md:467-479、504-510）。另有 R8「PATH 补 bin 目录」。改动 A 或 B 都需要同步 spec。
3. **mise 的 shim 与 `mise which` 都依赖 cwd**，本机代理的项目任务又以项目根为 cwd（index.ts:520-527），本仓库就钉了 node 26.0.0。codex 只装在非活跃版本 24.18.0 下：PATH 类策略（含 `-ilc`）找不到，只有扫描版本管理器根才能找到（B 现在就这么做）。版本管理器根是字典序倒排，别名目录排在最前（§1.5）。
4. **登录 shell 的代价**：
   - `-lc` 在本机等于什么都没补；
   - `-ilc` 要 0.25–0.5 s，有 16 行横幅噪声和 zle 告警，结果随 cwd 变；
   - 环境变量从 20 个增至 54 个，其中名字像凭据的有 5 个；这些变量会经 `sanitizedChildEnv` / SDK 默认 env 传给 CLI 子进程。
   - B 的探测在 Intelligence 初始化里被 `await`（intelligence-module.ts:768-770），任何新增耗时都会落在启动路径上。
5. **去掉门槛后的可见面**：
   - ⌘⇧L 默认启用，且与用户开关无关；
   - CoreBox 按钮和 OmniPanel 动作只看 `betaAvailable`，未装 CLI、未开启的机器上也会出现；
   - 项目菜单组和设置区也随之可见；
   - 每次挂载 CoreBox、打开项目菜单等都会对四个 CLI 做无缓存的探测（§4.2-7）。
   - 归档的 09-26 决定（只在明确为 false 时隐藏整组）和 08-04 R23（Windows / Linux 不显示）是现有 UI 逻辑的依据。
   - `betaAvailable` 是共享类型字段，渲染层的类型守卫要求它存在（local-ai-agents.ts:45-49）。
6. **覆盖与缓存语义不一致**：
   - A 的设置覆盖无效时会继续往下搜，B 的环境变量覆盖则是权威的；
   - 「选择程序」救不回 env-node CLI（§2.3）；
   - B 的缓存在生产中从不刷新，A 完全没有缓存。
7. **MCP**：
   - omp、pi 的 `mcp.json` 格式与现有 parser 兼容，只是没有登记。
   - 按 `kind:'mcp'` 加进 `userFiles` 会得到标题 `mcp`；用 `userMcpFiles` 才能自定义名字，但它只在 user 作用域生效。
   - 两个 CLI 还会读项目级和共享位置（`.omp/mcp.json`、`.pi/mcp.json`、`~/.config/mcp/mcp.json`、`.mcp.json`）以及兼容导入，与 claude layout 已有的 `.mcp.json` 存在重复来源。
   - opencode 格式、`.claude.json` 项目级不被读；发现时 project 作用域的 cwd 为 `/`；启用后的 stdio 服务器继承 launchd PATH（§7.7）。
   - 兄弟任务 `10-03-mcp-settings-page` 正在把这个组拆成独立页面，其调研 `research/mcp-page.md:35,60` 引用了现有的发现行标题。两边的改动会叠在同一批 UI 上。
8. **09-06 任务记录已过期**（§3.1）：若以它的 AC 为准，会误判为「未实现」；它的 D3 与本次去门槛一致。
9. **验证环境**：
   - `pnpm core:dev` 从终端启动，带完整 PATH，复现不了 GUI 问题；
   - 08-04 的打包验收很可能也是这种情况（§4.4，推断）；
   - 要复现就得用 launchd 启动的应用，本机已装 `/Applications/tuff.app` 2.4.14-beta.55。

## Caveats / Not Found

- omp 的 MCP 读取位置取自编译二进制里的字符串（omp 18.4.4），不是官方文档。§7.5 那条「unknown top-level field 即 disabled」的适用范围没有确认。
- 正在运行的 tuff.app 的真实环境没有取到（调研时未运行），GUI PATH 结论用第三方 GUI 应用的 `ps -E` 取样和 `launchctl getenv PATH` 旁证。
- Windows 上 `.cmd` 不经 shell 的 spawn 限制、mise 不受信任配置的行为，都没有在本机或本仓验证。
- 聊天 provider 的 codex 端到端运行没有在本次实测（09-06 spec 也注明「Codex's success path is not verified on this machine」，pi-provider-contracts.md:582-583）。
- 本文没有输出任何配置文件里的值：mcp.json、settings、环境变量都只列了键名、类型或数量；横幅内容也只描述了类型。
