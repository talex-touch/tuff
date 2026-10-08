# Settings Shortcut Status

本规格描述快捷键的保存、运行状态和用户界面。主进程 `global-shortcon.ts` 是注册与分类的权威；`ShortcutStorage` 保存用户选择。设置页快捷键对话框只列系统快捷键，插件功能卡片显示 FEATURE 绑定，插件详情快捷键列表显示该插件已有记录；插件自行注册的 RENDERER 绑定不新增独立界面入口。

## 状态与文字

| 主进程状态 | 设置页显示 |
| --- | --- |
| active | 不显示状态文字，显示默认的可用状态 |
| 记录被用户关闭或 disabled | 已停用 |
| OmniPanel 右键长按、macOS 未授予辅助功能权限 | 需要辅助功能权限，并附带授权提示 |
| conflict-system / conflict-plugin | 与系统快捷键冲突 / 与插件快捷键冲突 |
| unavailable + invalid | 快捷键无效 |
| unavailable + runtime-missing，local-ai-cli.quick-open | 打开「本机 AI 代理」后生效 |
| unavailable + runtime-missing，其他记录 | 所属功能或插件未运行 |
| unavailable + register-failed / register-error | 快捷键注册失败，可能被系统占用；含 ⌘Space 的组合在 macOS 上附带 Spotlight 提示 |

runtime-missing 是所属功能不能处理该记录，不是系统拒绝注册。状态文案沿用现有中英文消息，不新增错误类别。

## 持久化与恢复

- 用户通过现有快捷键设置修改系统记录的启用值，保存后重启仍保持该值。模块注册回调和默认值初始化不得把已有用户关闭的记录重新启用。
- 用户通过功能卡片绑定、改绑或清除 FEATURE 快捷键，保存后重启的存储、显示与宿主行为一致；插件停用不删除记录，恢复后沿用原绑定。
- 录制输入框获取焦点时临时暂停全局注册，失焦恢复；临时暂停不改变记录中的用户启用值。
- 持久化失败沿用原有失败反馈，不把内存修改当成保存成功。存储读取继续返回副本，不以共享内部可变数组绕过写入契约。

### Scenario: saved system enablement survives startup

Acceptance: A1

WHEN 用户关闭系统快捷键后正常退出并重启，THEN 配置仍为关闭、状态为 disabled、系统未注册该项；重新启用后重启仍为启用。WHEN 输入框录制结束，THEN 用户保存的关闭项仍为关闭。

### Scenario: saved feature binding survives startup

Acceptance: A2

WHEN 用户从插件功能卡片绑定、改绑和清除一个按键并逐次重启，THEN 配置和显示分别保持对应结果。插件停用和恢复不丢绑定；保存失败不显示成功。

## 哪些记录归为 runtime-missing

- MAIN 记录没有主进程回调，或 TRIGGER 记录没有触发器，例如本机代理总开关关闭后的 quick-open。
- FEATURE 与 RENDERER 的所属插件不存在，或状态不是 ENABLED / ACTIVE，例如停用、崩溃、加载失败、加载中、开发服务断连。
- 被用户关闭的记录优先显示 disabled，不因插件状态改变。
- runtime-missing 记录不向系统注册，按键交还前台应用。所属功能/插件恢复后重新分类并注册。
- 插件启停、崩溃、卸载和加载完成触发重新分类。插件模块晚于快捷键模块加载不影响加载完成后的注册。

## 打开期间实时刷新

- 宿主沿用既有快捷键变更事件发布最新状态；状态、原因、冲突对象、用户启用值或存储/有效按键变化都能更新用户可见结果，不只比较有效按键。
- 设置页的快捷键对话框、插件功能卡片和插件详情快捷键列表打开期间订阅变化，按现有读取 API 获得最新权威值，不需要重新打开。
- 读取失败保留既有错误处理；迟到响应不得覆盖更新后的状态、用户正保存的选择或另一个插件/功能。
- 组件销毁释放订阅。插件/功能切换后不保留旧身份请求的结果。

### Scenario: settings dialog follows current host state

Acceptance: A4

WHEN 快捷键对话框打开且所属功能启停、用户关闭/启用项或冲突原因变化，THEN 该项按键、启用值与文案自动更新，即使前后有效按键都为 null；保存中的选择和新状态不被旧响应回滚。

### Scenario: plugin shortcut surfaces follow their current owner

Acceptance: A5

WHEN 插件页打开且插件停用、崩溃、恢复或绑定/冲突变化，THEN 功能卡片和插件快捷键列表显示宿主最新状态；切换插件/功能或销毁组件后，旧结果/订阅不污染当前界面。

## 插件状态合并

- 多个不同插件在既有合并窗口内翻转运行状态，合并为一次重新分类/系统注册；该批次读取所有插件的最终运行状态，不漏其中任一插件。
- 后续窗口仍会重新分类。ENABLED 与 ACTIVE 都是运行态，两者互转不触发额外全局注册。
- 模块退出或销毁取消待处理定时批次，不在退出后重新注册。

### Scenario: simultaneous plugin startup is one complete registration pass

Acceptance: A6

WHEN 至少两个不同插件在同一个合并窗口内从未运行变为运行，THEN 系统只重新注册一轮且两者按键都可用；后续窗口生效，运行态互转不额外注册，销毁后无延迟注册。回归能识别移除合并守卫导致的多轮注册。

## 应用绑定占用判定

应用绑定预检与实际注册使用一致的可注册判定。停用、缺失或未运行插件的 FEATURE/RENDERER 记录不当作当前持有者；用户关闭项、非按键触发器和缺少回调的 MAIN 同样不占用。实际运行的插件和系统绑定仍遵守原冲突优先级。强制确认和保存失败回滚不改变。

### Scenario: a released plugin key can be bound by an application

Acceptance: A7

WHEN 一个未运行插件的记录仍存在但已释放按键，且无其他持有者，THEN 应用可正常绑定该键且不弹虚假占用确认；实际持有者仍报告真实冲突。

## 验证边界

### Scenario: real lifecycle proof preserves existing host contracts

Acceptance: A8

WHEN 最终候选执行相关回归、类型/lint 和真实隔离 Electron 与 ego 验证，THEN 持久化、重启、状态刷新和权限边界有实际证据；不把 globalShortcut mock 注册成功或静态截图当作宿主运行证明，不接触真实用户 profile。
