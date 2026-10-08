# Outcome

前端统一使用 TuffEx 的 `TxTerminal` 显示终端和日志。交互式终端连接主进程管理的真实 PTY（伪终端），支持输入、窗口尺寸变化、控制键和退出。删除本次替代的 terminal legacy 实现与接口，不保留兼容壳。Ghostty 只登记后续待办。

# Scope

- 在 `packages/tuffex` 新增基于 xterm.js 的 `TxTerminal`。组件可在普通 Vue/Web 和 Electron 渲染器使用，不依赖 Electron 或自行启动进程。统一终端显示、只读模式、尺寸适配、主题和资源释放。
- 将通用 piped-stdio terminal manager 替换为主进程的 PTY 会话实现，提供 typed transport 和新的 domain SDK。覆盖创建、输入、尺寸变化、输出、退出和关闭。
- 迁移 AI CLI 面板、插件日志、插件创建页的环境检测与安装终端。通用终端与 AI CLI 复用 PTY 会话核心；AI CLI 保留主进程 Provider、访问等级和原生会话门禁。
- 删除旧 `InteractiveTerminal`、`LogTerminal`、旧 touch-sdk `Terminal` 类，以及被替代的 manager、重复会话实现、旧接口和声明。迁移 `TerminalTemplate` 的实际调用，不留下只显示欢迎文字的假终端。
- 同步 TuffEx 导出、suite、Nexus 分类、导航、gallery、演示与中英文档。修正当前使用说明中的旧事件和失效路径，保留历史审计事实。
- 在长期待办记录 Ghostty/Web/WASM 引擎评估，本轮不实现。

# Non-goals

- 不嵌入原生 Ghostty 窗口，不引入 Ghostty 依赖或预留空实现。
- 不改 AI 任务流、模型调用、Provider 审批策略或外部终端打开目录等系统动作。
- 不为只读日志启动 shell，不在组件挂载时执行安装命令，不在渲染器暴露 Node.js 执行能力。
- 不修改原工作区及 `trellis-to-comet-native` 的状态。不自动提交、合并、推送、归档、发布或删除 worktree。
- 本轮不执行 Windows/Linux 远端运行验收，也不把本机 macOS 证据外推为跨平台验收通过。

# Acceptance examples

- `TxTerminal` 在真实浏览器中显示 ANSI 颜色、中文和连续输出；交互模式提供键盘输入，容器改变尺寸时正确适配，主题随宿主更新，卸载后释放实例和观察器。组件不要求 Electron 环境。
- Electron 中显式打开交互式终端后，子进程观察到真实 TTY；普通输入、Ctrl+C、尺寸变化和退出状态真实生效。可执行文件缺失时返回明确失败，不降级为管道进程或假成功。
- 新 typed SDK 的会话创建、订阅与关闭覆盖快速输出和快速退出：首段及末段输出不丢失，不截断较大的输出块。退出、关闭、组件卸载和窗口销毁后，进程及订阅释放，重复关闭不重复通知或释放。
- 创建、输入、resize 和关闭均保留 `system.shell` 权限与可信调用方校验。两个窗口或插件不能操作彼此的会话，猜测会话 ID 不能绕过隔离。身份或权限不满足时，不先启动子进程。
- AI CLI 面板使用 `TxTerminal` 和共用 PTY 核心；Provider 可执行文件、访问等级、项目工作目录、原生会话恢复与 lease 的既有约束保持。切换会话或关闭面板后，旧进程退出，迟到输出不能进入新会话。
- 插件日志通过 `TxTerminal` 的只读模式显示；增量追加、历史切换、清空、暂停和自动滚动保持正确。显示日志不创建 PTY、不发送输入，也不主动抢焦点。
- 插件创建页的 Node/degit 检测和显式安装入口使用新 SDK，不再依赖旧 `Terminal` 类。检测完成、失败或超时后释放资源；安装命令只在用户明确操作后执行，以独立 command/args 传入并显示真实输出与退出结果。
- 本次替代的旧 manager、终端组件、SDK 类、重复会话实现与旧接口已删除，全部当前调用方和生成声明迁移。没有转发别名、弃用 re-export 或双实现；不再使用的终端依赖移除，非终端功能和历史审计保持。
- `TxTerminal` 的包导出、suite 与 Nexus 分类、导航、gallery、双语文档和演示完整。相关现有检查通过；验收材料包含真实浏览器组件表现与隔离 Electron 的 PTY 交互，未执行的场景明确记录，不把测试替身当作真实运行证据。
- 长期待办包含 Ghostty 引擎评估，并明确本轮仅使用 xterm.js 与 PTY；本轮不存在 Ghostty 实现或依赖。

# Constraints and invariants

- 主进程唯一持有 PTY 和会话权限，前端只持有显示组件与 typed SDK。
- 保留现有授权、隐私和错误脱敏边界；日志不记录终端正文、完整命令参数、凭据或环境变量值。
- stdout/TTY 控制序列保持原顺序，业务层不按字符数裁掉有效终端输出。
- 只读日志与交互式终端共用显示组件，不共用执行权限。
- 产物、缓存和隔离运行 profile 放在 `/tmp`；不执行全局 npm 安装作为验收，不修改用户真实配置和 AI 会话。

# Decisions

- 用户已明确选择 `/tmp` 独立 worktree，目标分支为 `stage`。本需求分支为 `comet/terminal-pty-cutover`。
- xterm.js 作为本轮显示引擎，PTY 使用现有 `node-pty`。Ghostty 仅记录待办。
- 保持单个 Native change。显示、SDK、PTY 和调用方按同一会话契约一次切换，避免半迁移状态。
- 当前已有的 AI CLI PTY 能力继续保留，整合其实现；不把它误判为尚未实现，也不绕过业务门禁。

# Verification expectations

- 开发期运行最小相关的既有检查。必要的终端权限、会话隔离和清理契约测试随实现迁移，不新增仅断言接线或源码字符串的测试。
- 最终运行 TuffEx、utils、CoreApp 相关类型、导出和文档检查，真实浏览器验证组件，隔离 Electron 验证 typed SDK 到 PTY 的往返与清理。
- 全部正式验收由新的只读 Verifier 独立核对。实现前仍须用户确认这份完整目标与验收范围。

