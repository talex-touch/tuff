# Local Agent CLI

本规格描述 Tuff 如何发现并调用本机已安装的代理 CLI（pi、omp、codex、claude）。Tuff 只复用这些 CLI 自身的凭证并调用它们，不改写它们的配置，也不往代理目录写入任何东西。

## 可用性与入口

- 本机代理功能只在 macOS 提供，不依赖任何环境变量。代码、测试、脚本、CI 和工程文档中都不再出现 `TUFF_ENABLE_LOCAL_AI_CLI`；`.trellis/tasks/` 里的历史任务记录保留原文，作为当时的决策档案；`docs/comet/` 下本需求自己的 brief、规格和归档记录为规定这条检查而写出这个名字。
- 设置里的「本机 AI 代理」一节在 macOS 上始终可见。总开关 `localAiCli.enabled` 默认关闭。
- 以下入口只在总开关打开后才出现，关闭后随即收回：⌘⇧L 全局快捷键（`local-ai-cli.quick-open`）、CoreBox 按钮、OmniPanel 的「交给本机代理」动作、项目菜单的「本机代理」组。快捷键随总开关注册或注销；它在快捷键设置中的状态文案由 `settings-shortcut-status` 规定。
- 总开关关闭时，除非设置页请求详情，否则状态查询不运行任何 CLI，其余入口得到 `NOT_PROBED`。

### Scenario: no environment flag remains

Acceptance: A1

WHEN 在仓库中搜索 `TUFF_ENABLE_LOCAL_AI_CLI`，THEN 代码、测试、脚本、CI 和工程文档中都没有结果（`.trellis/tasks/` 的历史任务记录，以及 `docs/comet/` 下本需求自己的 brief、规格和归档记录除外）；本机代理的可用性只由平台决定。

## 查找 CLI

- 本机代理与聊天 provider 共用 `cli/cli-executable.ts` 这一套查找，顺序是：
  1. `TUFF_<CLI>_CLI_PATH`（权威）；
  2. 设置里「选择程序」的选择（非权威：失效时跳过并标记）；
  3. `PATH`；
  4. 版本管理器根；
  5. 固定 bin 目录。
- 不做 realpath。启动任何 CLI 时，都把它所在的目录放在子进程 PATH 的最前面。
- 版本管理器根按版本号从新到旧读取，只认 `v?主.次.修订` 形式的目录：
  - mise：`~/.local/share/mise/installs/node/<版本>/bin`
  - volta：`~/.volta/tools/image/node/<版本>/bin`
  - nvm：`~/.nvm/versions/node/v<版本>/bin`
  - fnm：`<fnm 根>/node-versions/v<版本>/installation/bin`
- fnm 根依次取：
  - `$FNM_DIR`（绝对路径时）；
  - 已存在的旧目录 `~/.fnm`；
  - macOS 的 `~/Library/Application Support/fnm`；
  - Linux 的 `$XDG_DATA_HOME/fnm`，未设置时为 `~/.local/share/fnm`。

### Scenario: fnm-only machine

Acceptance: A6

WHEN 一台机器只用 fnm 安装 Node，并通过 npm 全局安装了 CLI，fnm 根目录是上述任意一种，THEN 从 Dock 启动的 Tuff 能找到该 CLI，解析结果位于 `node-versions/v<x.y.z>/installation/bin` 下，并能以这个路径启动它。

## pi 任务与原生会话

- 本机代理以 RPC 模式启动 pi：先用 `get_state` 取得会话 id 和会话文件路径，再用 `get_entries` 取得当前 head，然后发送 prompt；回合结束后核对会话文件里追加的记录，并登记新的 head。
- **新任务**（没有已登记的会话）：会话文件允许在发送 prompt 时尚不存在，这符合 pi 首条消息后才写会话文件的行为。回合结束后，文件必须已经存在，且同时满足：
  - 文件头的 `type` 为 `session`，id 等于 `get_state` 返回的会话 id，`cwd` 解析后等于任务工作区；
  - 追加的记录从文件头之后线性展开：恰好一条用户消息，至少一条助手消息；
  - head 与 `get_entries` 的结果一致。

  任一条件不满足即为 `NATIVE_SESSION_CONFLICT`。
- **续接已登记的会话**：会话文件必须在发送 prompt 前就存在，其会话 id 和 head 必须与登记一致；文件被替换、头部不符、`cwd` 不符或追加不是线性的，都判为 `NATIVE_SESSION_CONFLICT`。会话文件缺失时为 `NATIVE_SESSION_MISSING`。
- **pi 自己找不到会话**：续接时 pi 按会话 id 查找会话文件，找不到就以 exit 1 退出、stderr 为「No session found matching '<id>'」，不输出任何协议行。判断这句话前先去掉 ANSI 颜色码（`FORCE_COLOR=1` 时 pi 会给它上色）。随后看 pi 的会话目录里是否还有以该会话 id 命名的 `.jsonl` 文件：
  - 还在：文件头部被改或内容被替换，判 `NATIVE_SESSION_CONFLICT`，登记的会话标为冲突；
  - 不在：判 `NATIVE_SESSION_MISSING`，登记的会话标为缺失。新任务在 pi 首次回复前被停止或失败时，会话已登记但文件从未写出，下次运行就是这种情况。

  两者都不可重试。面板显示「任务失败（<错误码>）」，「运行」不可再点，可以「新建任务」。这条规则只用于本机代理；首页聊天共用的会话缺失判断保持原样。
- 首页聊天的 pi 原生会话流程不在本规格范围内，行为不变。

### Scenario: new pi task with a lazily written session file

Acceptance: A2

WHEN 本机装的是 pi 0.84.3，用户在本机代理里用 pi 发起一个新的只读任务，THEN 任务正常完成并返回回答，会话被登记，不出现 `NATIVE_SESSION_CONFLICT`。随后续接该会话时，若会话文件被替换或头部不符，THEN 判为冲突；头部的会话 id 被改、pi 因此报找不到会话时，THEN 同样判为冲突。

### Scenario: running again after a new task stopped before pi's first reply

Acceptance: A7

WHEN 用户在本机代理里用 pi 发起新任务，并在 pi 首次回复前停止，随后在同一面板点「运行」，THEN 面板显示「任务失败（NATIVE_SESSION_MISSING）」，「运行」不可再点，登记的会话标为缺失；点「新建任务」后可以正常开始新任务。Tuff 带着 `FORCE_COLOR=1` 启动、pi 的报错带颜色码时，THEN 结果相同。
