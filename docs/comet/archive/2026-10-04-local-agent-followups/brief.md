# 目标

收尾本机代理探测修复（PR #2045，已合入 stage `b68cff9cc`）之后列出的遗留问题，让以下几件事在真实应用里都表现正确：
- 用 pi 跑本机代理任务，包括新任务被中途停止后再运行；
- 只用 fnm 装 Node 的机器能找到 CLI；
- 快捷键能说清为何没生效：本机代理快捷键在快捷键设置里说明，绑定到插件功能上的快捷键在插件详情页的功能卡片上说明；
- OmniPanel 的动作列表能跟着主进程更新；
- 文案能按原样显示。

同时确认 `TUFF_ENABLE_LOCAL_AI_CLI` 已经彻底不再使用。

# 范围

1. **`TUFF_ENABLE_LOCAL_AI_CLI` 残留**
   - 已查明：代码、测试、脚本、CI 里已经没有任何引用（PR #2045 删除了门槛判断）。
   - 本机 launchd 环境、`~/.zshrc`、`~/.zprofile`、`~/.zshenv` 和当前 shell 都没有设置它。
   - 剩下的提及只在 `.trellis/tasks/` 的历史任务记录里，按「决策」Q2 保留；本需求自己的 brief、规格和归档记录为了规定这条检查，也会写出这个名字。
2. **pi 0.84.3 跑本机代理任务**
   - 新任务报 `NATIVE_SESSION_CONFLICT`：`apps/core-app/src/main/modules/local-ai-cli/index.ts` 在 `get_entries` 之后、发送 prompt 之前，调用 `capturePiSessionFile`（`pi-native-session.ts`），要求会话文件已存在并带有合法文件头。pi 0.84.3 只在首条回复之后才写会话文件，所以新任务一开始就被判冲突。
   - 首页聊天（`ai/providers/pi-cli-provider.ts`）不受影响：新会话是在回合结束后才核对文件，续接会话时文件本来就在。
   - 只修本机代理这条路径；续接会话的冲突检测保持原样。
   - 续接时 pi 自己找不到会话：pi 以 exit 1 退出，stderr 为「No session found matching '<id>'」。新任务在 pi 首次回复前被停止后，会话已登记但文件从未写出，再运行就会走到这里；会话头部的 id 被改、文件被别的会话内容替换时也一样。现有的缺失判断不认这句话，结果是可重试的 `PROTOCOL_INVALID`。分类见「决策」Q4、Q5。
3. **vue-i18n 文案**：
   - 两条编译失败的文案：示例 JSON 的 `{` `}` 被当成了插值语法，改用 vue-i18n 的字面量写法。
     - `plugin.new.install.metadataPlaceholder`：`PluginNew.vue:501` 在用；
     - `intelligence.workflow.inputPlaceholder`：代码里没有引用，但同样无法编译。
   - en-US 里三条含裸 `|` 的文案（`settings.intelligence.promptStatsLabel`、`settings.intelligence.landing.channels.statsDesc`、`settings.intelligence.landing.capabilities.statsDesc`）：能编译，但 `|` 被当成复数分隔符，只显示第一段。按「决策」Q7 一并转义。
4. **快捷键设置里的状态文字**
   - 现状：本机代理总开关关闭后，「打开本机 AI 代理」的快捷键记录仍在，但主进程回调已注销，`global-shortcon.ts` 把状态归为 `unavailable / runtime-missing`；`SettingTools.vue` 没有对应文案，落到兜底的「快捷键注册失败，可能被系统占用」，原因写错了。呈现方式见「决策」Q1。
   - 插件快捷键（原 brief 写「插件未运行时，它的快捷键也走同一条路径」，与代码不符，已更正）：
     - 插件快捷键有两类：插件通过 SDK 自己注册的（`RENDERER`，按下时发给插件），以及用户在功能管理里绑定到插件功能上的（`FEATURE`，按下时由宿主运行该功能）。
     - 主进程只把缺回调的系统记录（`MAIN`、`TRIGGER`）归为 `runtime-missing`；插件快捷键不管插件是否在运行，都按正常记录注册并显示「可用」。插件没有运行时，按下 `RENDERER` 快捷键会静默失败，`FEATURE` 快捷键被忽略（`feature-shortcut-service.ts`）。
     - 插件被停用或卸载时，它的快捷键记录不会被清除；快捷键模块先于插件模块加载，主进程里也没有插件状态变化的通知。
     - 按「决策」Q6 扩大范围：所属插件没有运行时，这两类快捷键也归为 `runtime-missing`，并在插件状态变化时重新分类。「没有运行」与 CoreBox、功能快捷键的判断一致：插件不存在，或状态不是 `ENABLED` / `ACTIVE`。
     - 按「决策」Q8，归为 `runtime-missing` 的插件快捷键不向系统注册，按键交还前台应用；插件恢复运行后重新注册。
     - 显示位置（Build 中查明，原 brief 以为插件快捷键在快捷键设置里）：设置页的快捷键对话框只列系统快捷键（`SettingTools.vue` 用 `isSystemShortcut` 过滤，标题即「系统级快捷键」），插件快捷键从不在其中。用户绑定到插件功能上的快捷键（`FEATURE`）显示在插件详情页的功能卡片上（`PluginFeatureDetailCard.vue`），卡片目前只提示冲突；插件自己注册的快捷键（`RENDERER`）在任何界面都不显示。按「决策」Q10，功能卡片在绑定的快捷键为 `runtime-missing` 时显示「所属功能或插件未运行」。
5. **OmniPanel 收不到功能刷新**
   - 现状：`TuffMainTransport.broadcast` 的注释写「广播给所有窗口」，底层 `channel.broadcast` 实际只发给主窗口（`channel-core.ts`）。
   - 结果：omni-panel 模块发出的 `omniPanelFeatureRefreshEvent` 永远到不了 OmniPanel 窗口，打开期间列表不会更新。
   - 修法：omni-panel 模块在刷新时额外点对点发给 OmniPanel 窗口；同时把 `broadcast` 的注释改成实际行为。
6. **fnm 目录结构**
   - 现状：CLI 查找（`ai/providers/cli/cli-executable.ts`）只看 `~/.fnm/node-versions/<版本>/bin`。
   - fnm 的实际布局（依据 fnm 文档和源码）：
     - 根目录取 `$FNM_DIR`；未设置时，已存在的旧 `~/.fnm` 优先；否则 macOS 用 `~/Library/Application Support/fnm`，Linux 用 `$XDG_DATA_HOME/fnm` 或 `~/.local/share/fnm`；
     - 每个版本装在 `node-versions/v<x.y.z>/installation/`，可执行文件在其下的 `bin/`。

# 非目标

- 不改 `transport.broadcast` 的全局语义（仍然只发主窗口），只修 OmniPanel 收刷新这一处。
- 不碰「Claude Code MCP」接入失败。它已由 talex-touch-3f 的 `intelligence-audit-skills-mcp` change 修复，`ai-cli-import-service.ts`、`ai-import-runtime.ts`、`ai-orchestrator-store.ts` 及其测试一律不动。
- 不改首页聊天的 pi 原生会话流程，也不改续接会话的校验规则；首页聊天共用的 `isNativeSessionMissingError` 保持原样。
- 不处理 `~/.npm-global/bin` 这类旁边没有 node 的全局 CLI。
- Windows、Linux 上的本机代理入口维持现状。
- 不往任何代理目录写入，也不改写 CLI 的配置。Tuff 只复用、调用这些 CLI。
- 快捷键设置页和插件详情页打开期间，不随插件状态或总开关实时刷新（原有行为）；重新打开即可看到新状态。
- 插件被停用或卸载时，不删除它的快捷键记录；插件恢复运行后沿用原来的按键。
- 设置页的快捷键对话框维持只列系统快捷键（原有）；插件自己注册的快捷键不新增界面入口。

# 约束与不变量

- 本 change 在独立 worktree `/private/tmp/tuff-local-agent-followups`（分支 `comet/local-agent-followups`）里实现，基线和目标分支都是 `stage`。共享工作区和其他会话的 change 不受影响。
- pi 会话修复必须保住 `spec/main-process/pi-provider-contracts.md` §9、§10 的冲突语义：续接时会话 id 与预期 head 必须一致；会话文件被替换、头部不符、cwd 不符、非线性追加，都仍然判为 `NATIVE_SESSION_CONFLICT`。
- 另一个会话的 `pi-desktop-agent-workspace-reuse` change 也会涉及 Pi 原生会话。改 `pi-native-session.ts` 前要和它对齐，避免互相覆盖。
- 插件「是否在运行」只有一种判断，与 `PluginFeaturesAdapter.isPluginActive`、`triggerFeatureShortcut` 相同，不另立口径。

# 决策

- Q1（2026-10-03）：快捷键状态写准原因，同类一并改。
  - 总开关关闭时，「打开本机 AI 代理」一行显示「打开『本机 AI 代理』后生效」；
  - 其他因所属功能或插件未运行而缺回调的快捷键（`runtime-missing`），显示「所属功能或插件未运行」；
  - 真正注册失败的情况（`register-failed` / `register-error`），仍显示「快捷键注册失败，可能被系统占用」。
- Q2（2026-10-03）：保留 `.trellis/tasks/` 历史任务记录里对 `TUFF_ENABLE_LOCAL_AI_CLI` 的提及，不改写归档决策。
- Q3（2026-10-03，第 1 轮验收后）：先补「续接从未写出的 pi 会话时报可重试的 `PROTOCOL_INVALID`」这个缺口再归档。
- Q4（2026-10-03，第 2 轮验收后）：判断 pi 的「找不到会话」报错前，先去掉 ANSI 颜色码（`FORCE_COLOR=1` 时 pi 会给这行报错上色）。
- Q5（2026-10-03，第 2 轮验收后）：续接时 pi 报找不到会话，再看 pi 的会话目录里以该会话 id 命名的文件是否还在：在，就判 `NATIVE_SESSION_CONFLICT`（头部被改或被替换）；不在，判 `NATIVE_SESSION_MISSING`，并把登记的会话标为缺失。
- Q6（2026-10-03，第 2 轮验收后）：扩大范围，所属插件没有运行时，插件快捷键也显示「所属功能或插件未运行」。
- Q7（2026-10-03，第 2 轮验收后）：en-US 三条含裸 `|` 的文案一并转义。
- Q8（2026-10-03）：所属插件没有运行时，释放它的快捷键：不向系统注册，按键交还前台应用；插件恢复运行后自动重新注册。与系统快捷键缺回调时的处理一致。
- Q9（2026-10-03，已被 Q10 取代）：插件详情页的功能快捷键卡片不改，照旧只提示冲突。
- Q10（2026-10-04，Build 中查明插件快捷键不在快捷键设置里之后）：「所属功能或插件未运行」显示在插件详情页的功能卡片上：用户绑定到该功能的快捷键为 `runtime-missing` 时，卡片显示这句；冲突提示不变。插件自己注册的快捷键不新增入口；释放和恢复按键照做。

# 验收示例

- 在仓库里搜索 `TUFF_ENABLE_LOCAL_AI_CLI`，代码、测试、脚本、CI 和工程文档中都没有结果（`.trellis/tasks/` 的历史任务记录，以及 `docs/comet/` 下本需求自己的 brief、规格和归档记录除外）；本机 launchd 与 shell 环境也没有设置它。
- 本机装的是 pi 0.84.3，在本机代理里用 pi 开一个新的只读任务（提示词「只回复 OK」），任务正常完成并返回回答，不出现 `NATIVE_SESSION_CONFLICT`。随后续接这个会话，仍按原规则校验：会话文件被替换或头部不符时，判为冲突；头部的会话 id 被改、pi 因此报找不到会话时，同样判为冲突。
- 插件安装页的元数据输入框占位文字显示为 `{ "tag": "v1.0.0" }`；两份语言文件里所有文案都能被 vue-i18n 编译，没有编译错误；含 `|` 等需要原样显示的字符的文案，渲染出完整原文。
- 本机代理总开关关闭时，快捷键设置里「打开本机 AI 代理」一行显示「打开『本机 AI 代理』后生效」，不再显示「快捷键注册失败，可能被系统占用」；打开总开关后，这一行恢复为正常的可用状态。
- OmniPanel 打开期间，在设置里切换本机代理总开关，OmniPanel 的动作列表随之增删「交给本机代理」，不需要关闭重开。
- 一台只用 fnm 安装 Node、并通过 npm 全局装了 CLI 的机器上，无论 fnm 根目录是 `$FNM_DIR`、`~/.fnm`、`~/Library/Application Support/fnm` 还是 `~/.local/share/fnm`，从 Dock 启动的 Tuff 都能找到这个 CLI，解析到的路径位于 `node-versions/v<x.y.z>/installation/bin` 下。
- 本机代理里用 pi 开的新任务，在 pi 首次回复前被停止；随后在同一面板点「运行」，显示「任务失败（NATIVE_SESSION_MISSING）」，「运行」不可再点，点「新建任务」后可以正常开始新任务。Tuff 带着 `FORCE_COLOR=1` 启动、pi 的报错带颜色码时，结果相同。
- 一个插件被停用（或处于崩溃、加载失败、已卸载等没有运行的状态）时，用户绑定到它功能上的快捷键，在插件详情页的功能卡片上显示「所属功能或插件未运行」；这个快捷键和插件自己注册的快捷键都不再占用按键。插件重新启用并运行后，重新打开插件详情页，卡片不再显示这句，按键重新生效。

# 验证预期

- **单测**：
  - 本机代理新任务的会话核对：文件后出现时通过；续接、被替换、头部不符时仍判冲突；
  - 续接时 pi 报找不到会话：同名文件还在判冲突，不在判缺失；报错带 ANSI 颜色码时结果相同；
  - fnm 四种根目录和 `installation/bin` 布局，用合成目录验证；
  - 快捷键状态：系统记录的 `runtime-missing` 文案；插件快捷键随插件状态归类，插件状态变化后重新分类；功能卡片的 `runtime-missing` 文案；
  - OmniPanel 刷新的投递目标。
- **全量编译检查**：用 vue-i18n 编译器编译两份语言文件的全部文案，结果为 0 个失败；含 `|` 的文案渲染出完整原文。
- **真实应用**：从本 worktree 起隔离实例，被测 Electron 只给 launchd PATH，验证：
  - pi 新任务，以及新任务停止后再运行；后者另以 `FORCE_COLOR=1` 启动验证一次；
  - 快捷键设置这一行；
  - OmniPanel 列表随开关更新；
  - 停用、启用插件后，插件详情页功能卡片上的状态文字，以及系统层面是否仍注册了这个按键。
  - fnm 在本机未安装，以单测和合成目录为准。
