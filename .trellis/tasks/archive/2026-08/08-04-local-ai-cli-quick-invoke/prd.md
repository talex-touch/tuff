# 本机 AI CLI 快速调用

## Goal

让用户从 Tuff 快速、直接启动设备上已安装、已认证、已配置的 Pi、Codex、Claude Code 和 OMP 本机进程，优先完成快速问答、回复、解释、总结和改写；Tuff 展示执行过程与结果，但不接管 CLI 的账号、密钥、配置或模型调用。

## Background

- 本功能是本机 CLI 的直接调用能力，不是现有 AI CLI import 的扩展；两条链路必须保持独立。
- 主要场景是快速回答问题，不以 coding workspace 为默认前提。普通问答只需要一个安全、稳定、由 Tuff 拥有的启动目录。
- 现有 OmniPanel 已能采集选中文本、剪贴板文本、当前应用名和窗口标题，并具有 AI 结果预览、复制与确认操作，可作为统一快捷面板继续扩展。
- 现有 `TerminalModule` 是 `shell: false` 的 piped-stdio runner，不是 PTY；源码明确不支持交互式程序、ANSI、resize 或 job control，不能承载完整 CLI TUI。
- 现有 CoreApp 已有全局快捷键注册、选区抓取、前台应用探测和自动粘贴能力；新功能必须复用这些边界。
- macOS 精简 GUI `PATH=/usr/bin:/bin:/usr/sbin:/sbin` 下无法发现本机四个 CLI，执行层不能只依赖 Electron 启动环境的 `PATH`。

### Local Verification Evidence

| CLI | Version | Resolved executable | Text call | JSON/JSONL call | Interactive PTY |
| --- | --- | --- | --- | --- | --- |
| Pi | `0.83.0` | `~/.local/share/mise/installs/node/24.18.0/bin/pi` | `PI_READY` | `PI_JSON_READY` | `PI_PTY_READY` |
| Codex | `0.145.0` | `/opt/homebrew/bin/codex` | `CODEX_READY` | `CODEX_JSON_READY` | `CODEX_PTY_READY` |
| Claude Code | `2.1.207` | `~/.local/bin/claude` | `CLAUDE_READY` | `CLAUDE_JSON_READY` | `CLAUDE_PTY_READY` |
| OMP | `17.0.4` | `~/.bun/bin/omp` | `OMP_READY` | `OMP_JSON_READY` | `OMP_PTY_READY` |

- 四个 PTY smoke 均在真实终端会话中返回预期文本，随后已停止；无本轮 PTY smoke 进程存活。
- Pi/OMP 提供 JSON/RPC 或 ACP 形态，Codex 提供 `exec --json` 与 app-server，Claude Code 提供 bidirectional `stream-json`/Agent SDK；逐工具审批必须使用各自可验证的控制协议，不能通过解析 TUI 文本模拟。

## Requirements

- **R1 — 直接调用**：由 Tuff main 进程直接启动设备上的 `pi`、`codex`、`claude` 或 `omp` 可执行文件，复用各 CLI 自己的本机认证、配置和模型链路。
- **R2 — 非导入边界**：不得导入、复制、迁移或持久化 CLI 的 API Key、OAuth token、配置文件、技能、命令、规则、MCP、transcript 或历史会话。
- **R3 — 默认关闭**：用户未在设置中明确启用前，不得启动任何本机代理进程。
- **R4 — main ownership**：renderer 只能选择固定 provider、任务形态和受约束参数；可执行文件解析、参数构造、环境、cwd、进程生命周期和原生事件解析由 main 进程拥有。
- **R5 — 统一任务流**：应用内任务模式使用每个 CLI 的机器可读协议，将原生事件规范化为开始、文本增量、工具审批、状态、完成、失败和取消事件。
- **R6 — 生命周期**：支持精确取消，并在窗口销毁、应用退出或调用结束后回收子进程、进程组、PTY、listener、pending approval 和 stream。
- **R7 — 可操作错误**：CLI 缺失、不可执行、未认证、配置错误、版本不兼容、非零退出和协议异常必须映射为稳定、可操作的状态；不得记录 prompt、上下文、完整输出、环境变量、密钥或未脱敏原生错误。
- **R8 — 专用安全合同**：不得复用现有任意命令 Terminal transport 暴露此能力；使用专用、白名单化、host-only typed transport，插件调用必须 fail closed。
- **R9 — 选择透明**：用户始终看到实际 provider 和权限策略；普通问答不要求处理 cwd，只有明确目录上下文时才显示目录；执行前不存在隐式 provider 或目录回退。
- **R10 — 双调用形态**：同时提供应用内任务流和完整交互式 CLI 终端；两种形态直接调用同一 provider executable，并复用同一启用状态、路径解析、上下文和权限策略。
- **R11 — 真实 PTY**：交互形态必须使用真实 PTY，支持 stdin、ANSI、resize、退出和取消；不得用 piped stdio 冒充交互终端。
- **R12 — 可靠续接**：任务流进入交互终端时保持 provider 与 cwd。只有 CLI 返回稳定原生 session id 且版本支持 resume 时才续接；否则明确标记为新会话，不伪造上下文连续性。
- **R13 — 只读默认**：普通快速问答默认不开放写工具；显式目录任务默认只读。每次升级到工作区写入都要在启动前确认，且不得提供 `danger-full-access`、`bypassPermissions`、`yolo` 或等价无约束模式。
- **R14 — 两个入口**：第一版提供 CoreBox“交给本机代理”动作，以及可配置全局快捷键；两者进入同一个调用面板和同一份草稿状态。
- **R15 — Beta 环境门控**：只有 macOS main 启动环境中的 `TUFF_ENABLE_LOCAL_AI_CLI=1` 才开放。未开放时设置项、CoreBox 动作、全局快捷键和执行 handler 均不可见或不可用；环境变量不能替代用户设置同意。
- **R16 — 首次启用闭环**：Beta 已开放但用户设置未启用时，保留任务草稿并自动打开“设置 → 智能 → 本机代理”；启用后返回原调用面板，重新展示 provider、权限和适用目录，用户再次点击运行才可启动进程。
- **R17 — Provider 白名单**：设置页提供 Beta 总开关、四个 CLI 的独立允许开关和默认 CLI。只有同时满足环境门控、用户总开关、provider 允许和 executable 可用的 CLI 才能启动。
- **R18 — cwd 判断**：普通问答默认使用 Tuff 拥有的隔离 AI 工作目录，不选择或记忆 coding 目录。只有入口携带明确文件/文件夹上下文，或用户主动选择“针对目录处理”时，main 才使用该规范目录；无法可靠判断时保持 Tuff 默认目录。
- **R19 — 上下文预览**：CoreBox 使用当前输入；全局快捷键自动采集用户已授权的当前上下文。所有将发送给 CLI 的上下文必须在启动前可见、可单项移除，点击运行前不得启动 CLI 或传出内容。
- **R20 — 文本上下文范围**：自动上下文仅包含选中文本、剪贴板文本、当前应用名和窗口标题；不自动截屏、不 OCR、不读取整个窗口正文，也不自动附加剪贴板图片或文件。
- **R21 — 显式结果动作**：结果默认只在 Tuff 展示。完成后提供“复制”“回填到原应用”和适用时的“在终端继续”；不得自动覆盖剪贴板、替换选区或向其他应用输入。
- **R22 — CLI 原生会话**：允许 CLI 按自身规则持久化原生会话。Tuff 仅在当前调用生命周期内持有 provider 与 opaque session id，不复制 transcript，也不新增 Tuff 调用历史数据库。
- **R23 — macOS 首发**：第一阶段 Beta 仅在 macOS 开放。共享合同保持可扩展，但 Windows/Linux 在各自 discovery、PTY、进程树清理和真机验收完成前不得显示入口。
- **R24 — 自由输入与模板**：面板提供自由任务输入，以及“快速回复、总结、解释、改写”模板。模板只生成可编辑 prompt，不得绕过上下文预览、权限选择或显式运行。
- **R25 — 统一逐工具审批**：任务流和交互终端的具体工具调用都必须通过 Tuff 统一审批界面暂停并等待用户决定，再由 main 映射回 CLI 原生控制协议。无法提供可验证逐工具审批协议的 CLI/版本只允许只读，禁止 auto-approve 或 bypass 兜底。

## Acceptance Criteria

- [x] **AC1**：用户设置未启用时触发入口，只打开本机代理设置并保留草稿，不产生 Pi/Codex/Claude/OMP 子进程。
- [x] **AC2**：启用后可选择允许且可用的 provider 发起任务，并持续看到规范化文本、状态和终态。
- [x] **AC3**：四个 provider 的协议 fixture 覆盖成功、非零退出、格式错误、取消、进程启动失败和不支持版本。
- [x] **AC4**：精简 GUI `PATH` 下仍能通过受支持 discovery 或用户确认的 executable 找到 CLI；无法解析时返回明确诊断。
- [x] **AC5**：调用链不读取或写入 AI CLI import store，不复制 CLI 配置、技能、MCP、凭据、transcript 或历史会话。
- [x] **AC6**：renderer 无法提交任意 executable、shell 字符串、环境变量、原生 session path 或越权 cwd。
- [x] **AC7**：取消、窗口销毁和应用退出后无遗留子进程、进程组、PTY、listener、approval 或 stream。
- [x] **AC8**：macOS 对 Pi、Codex、Claude Code、OMP 各完成真实只读 task smoke，并观察到统一结果事件。
- [x] **AC9**：macOS 对四个 provider 各完成真实 PTY smoke，键盘输入、ANSI、resize、正常退出和强制取消可用。
- [x] **AC10**：任务流与交互终端显示同一 provider、上下文目录和权限；切换形态不隐式改变它们。
- [x] **AC11**：默认参数在四个 provider 上均不可写；工作区写入只对当前调用有效，结束后恢复只读。
- [x] **AC12**：CoreBox 与全局快捷键进入同一流程；provider、prompt、上下文和权限行为一致。
- [x] **AC13**：缺少或关闭 Beta 环境变量时无入口且执行请求 fail closed；环境门控开启但用户设置关闭时仍满足 AC1。
- [x] **AC14**：首次启用往返设置后 prompt 与上下文草稿完整保留；启用动作不启动进程，返回后的显式运行只启动一次调用。
- [x] **AC15**：关闭某 CLI 允许开关后，该 CLI 从选择器移除，现有草稿不自动回退到其他 provider，直接执行请求被拒绝。
- [x] **AC16**：无目录上下文的问答使用 Tuff 隔离 AI 目录且不弹目录选择器；明确目录使用规范路径并显示；模糊、失效或越权路径不改变默认 cwd。
- [x] **AC17**：每个自动上下文项均显示来源、类型和有界预览；移除后不进入最终 prompt，取消后不保留未提交上下文。
- [x] **AC18**：自动上下文只包含选中文本、剪贴板文本和当前应用/窗口元数据；截图、OCR、窗口正文、剪贴板图片和文件均不会采集或发送。
- [x] **AC19**：生成完成不改变剪贴板或原应用；只有显式点击才复制或回填，原窗口/选区失效时安全失败。
- [x] **AC20**：同一调用生命周期内可使用原生 session id 进入对应 CLI 继续；生命周期关闭后 Tuff 不保留 prompt、上下文、输出或 session id。
- [x] **AC21**：`TUFF_ENABLE_LOCAL_AI_CLI=1` 只在 macOS 开放第一阶段 Beta；Windows/Linux 同期构建保持入口和执行 handler 关闭。
- [x] **AC22**：四个模板生成可编辑、本地化任务文本；用户修改后的最终 prompt 进入选定 CLI，选择模板本身不启动进程。
- [x] **AC23**：每个 provider 分别证明工具请求可暂停、批准后继续、拒绝后不执行、超时/关闭后取消；无法完成握手的版本只提供只读模式。

## Out of Scope

- 导入或同步 CLI 配置、技能、命令、规则、MCP、凭据、transcript 或历史会话。
- 在 Tuff 内重做四个 CLI 的账号登录、模型管理、provider 配置或 CLI 自动安装/升级。
- 任意 shell 命令执行器、renderer 自定义 executable，或将本机代理入口扩展为通用终端。
- Tuff 统一调用历史、跨设备同步、后台无人值守 agent、定时任务或并行 agent 编排。
- 自动截图、OCR、窗口正文抓取、剪贴板图片/文件采集。
- 第一阶段开放 Windows 或 Linux 本机代理入口。
