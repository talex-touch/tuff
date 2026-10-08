# Local Agent CLI

本规格描述 Tuff 如何发现并调用本机已安装的代理 CLI（pi、omp、codex、claude）。Tuff 只复用 CLI 自身的凭证，不改写其配置或往代理目录写入内容。

## 可用性与入口

- 本机代理只在 macOS 提供，不依赖环境开关；代码、测试、脚本、CI 和工程文档不使用 TUFF_ENABLE_LOCAL_AI_CLI，历史任务档案和用于规定此检查的 Comet 正式文档除外。
- 设置中的本机 AI 代理在 macOS 始终可见，localAiCli.enabled 默认关闭。
- 总开关打开后才显示 quick-open 全局快捷键、CoreBox 按钮、OmniPanel 交给本机代理动作和项目菜单的代理组；关闭随即收回，快捷键状态由 settings-shortcut-status 规定。
- 总开关关闭时，除非设置页请求详情，状态查询不运行 CLI，其他入口得到 NOT_PROBED。

## 查找 CLI

本机代理与聊天 Provider 共用 cli/cli-executable.ts：依次查权威 TUFF_<CLI>_CLI_PATH、设置中的非权威程序选择、PATH、版本管理器根和固定 bin。失效的非权威选择跳过并标记；不做 realpath。启动时把所选 CLI 的目录放在子进程 PATH 最前面。

版本管理器只认 v?主.次.修订并从新到旧查找：mise 的 ~/.local/share/mise/installs/node/<版本>/bin、volta 的 ~/.volta/tools/image/node/<版本>/bin、nvm 的 ~/.nvm/versions/node/v<版本>/bin、fnm 的 <fnm 根>/node-versions/v<版本>/installation/bin。fnm 根依次取绝对 FNM_DIR、已存在的 ~/.fnm、macOS 的 ~/Library/Application Support/fnm 或 Linux 的 XDG_DATA_HOME/fnm（默认 ~/.local/share/fnm）。Dock 启动和仅有 fnm 的环境仍按此契约查找。

## Pi 任务与原生会话

- RPC 启动 Pi，先 get_state 取得会话 id/文件路径，再 get_entries 取得当前 head，然后发送 prompt；真正完成后核对追加记录并登记新 head。
- 新任务允许 prompt 前文件尚不存在，符合首条消息后才写文件的行为。完成时必须存在；文件头 type=session，id 匹配 get_state，cwd 匹配工作区；追加从头部线性展开，恰好一条用户消息、至少一条助手消息；head 匹配 get_entries。任一不符为 NATIVE_SESSION_CONFLICT。
- 续接已登记会话要求文件在 prompt 前存在且 id/head 与登记一致；替换、头部/cwd 不符或非线性追加为 NATIVE_SESSION_CONFLICT，缺文件为 NATIVE_SESSION_MISSING。
- Pi 因找不到会话而 exit 1、stderr 为 No session found matching '<id>' 且没有协议行时，先去 ANSI，再检查会话目录中对应 id 的 JSONL：还存在为 CONFLICT，不存在为 MISSING。首条回复前停止的新任务再次运行也遵守此规则；FORCE_COLOR=1 不改变判断。
- 上述两类错误不可重试，面板显示任务失败及错误码，运行不可点，可新建任务。首页聊天共用会话缺失行为保持不变。

## Pi 重试与最终回合完成

agent_end 携带 willRetry=true 表示当前尝试结束而非整个任务结束。此时不得提前发起原生会话核对、登记最终 head、发布最终完成或切换到已完成。后续的自动重试事件和回答继续属于同一任务。

真正的 agent_settled 或 willRetry 不为 true 的 agent_end 才进入既有最终核对路径；终态按既有任务身份、取消/失败语义处理，重复或旧事件不能重复提交核对与迟到成功。不改重试次数、退避、模型选择、凭据或工具权限。

### Scenario: retrying attempt does not complete native verification

Acceptance: A3

WHEN 一次 Pi 尝试发出 agent_end 且 willRetry=true，随后自动重试并继续回答，THEN 重试期间不核对会话、不提交最终 head、不提前完成；真正 settled/最终结束后按既有规则只核对一次。失败、取消和重复/迟到事件不能伪造成功。

## 保留契约与真实验证

### Scenario: existing local CLI and native session behavior remains valid

Acceptance: A8

WHEN 执行当前 CLI 查找、总开关、原生会话和权限回归以及真实隔离 Pi RPC 流程，THEN fnm/Dock 查找、默认关闭、只复用 CLI 凭据、新任务延迟写文件、续接头部冲突、首条回复前停止后 MISSING 及颜色 stderr 判定保持有效，首页聊天行为不变；重试核对时序通过实际运行日志证明，不以测试中的事件转发回声代替宿主行为。
