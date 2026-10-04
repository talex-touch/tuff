# Settings Shortcut Status

本规格描述快捷键状态文字的含义，以及插件快捷键如何跟随所属插件的运行状态。状态由主进程的快捷键模块（`global-shortcon.ts`）分类；设置页的快捷键对话框（`SettingTools.vue`，只列系统快捷键）和插件详情页的功能卡片（`PluginFeatureDetailCard.vue`）按分类显示文字。

## 状态与文字

| 主进程状态 | 设置页显示 |
| --- | --- |
| `active` | 不显示状态文字（显示默认的「可用」） |
| 记录被用户关闭（`meta.enabled === false`）或 `disabled` | 「已停用」 |
| OmniPanel 右键长按、macOS 未授予辅助功能权限 | 「需要辅助功能权限」，并附带授权提示 |
| `conflict`（`conflict-system` / `conflict-plugin`） | 「与系统快捷键冲突」/「与插件快捷键冲突」 |
| `unavailable` + `invalid` | 「快捷键无效」 |
| `unavailable` + `runtime-missing`，且为 `local-ai-cli.quick-open` | 「打开『本机 AI 代理』后生效」 |
| `unavailable` + `runtime-missing`，其他记录 | 「所属功能或插件未运行」 |
| `unavailable` + `register-failed` / `register-error` | 「快捷键注册失败，可能被系统占用」；含 ⌘Space 的组合在 macOS 上再附带 Spotlight 提示 |

`runtime-missing` 表示记录仍在、但所属功能或插件当前不能处理它。它不是系统拒绝注册，所以不使用「注册失败」的说法。中英两种语言都要有对应文案。

## 哪些记录归为 `runtime-missing`

- 系统记录：`MAIN` 记录没有注册主进程回调，或 `TRIGGER` 记录没有注册触发器。例如本机代理总开关关闭后的 `local-ai-cli.quick-open`。
- 插件记录：插件通过 SDK 注册的快捷键（`RENDERER`），以及用户绑定到插件功能上的快捷键（`FEATURE`），在所属插件没有运行时归为 `runtime-missing`。
  - 「没有运行」与 CoreBox、功能快捷键的判断相同：插件不存在（例如已卸载，记录仍在），或插件状态不是 `ENABLED` / `ACTIVE`（例如已停用、崩溃、加载失败、加载中、开发服务器断连）。
  - 被用户关闭的记录仍显示「已停用」，不因插件状态改变。
- 归为 `runtime-missing` 的记录不向系统注册，按键交还前台应用。所属功能或插件恢复后，下一次重新分类时自动注册。
- 插件状态变化时（启用、停用、崩溃、加载完成、卸载），快捷键模块重新分类并重新注册全部快捷键；插件模块晚于快捷键模块加载，插件加载完成后同样会触发重新分类。
- 插件被停用或卸载时不删除它的快捷键记录；恢复运行后沿用原来的按键。
- 显示位置：设置页的快捷键对话框只列系统快捷键，插件快捷键不在其中。用户绑定到插件功能上的快捷键（`FEATURE`）在插件详情页的功能卡片上显示：`conflict` 时提示冲突（原有），`runtime-missing` 时显示「所属功能或插件未运行」，中英两种语言都有对应文案。插件自己注册的快捷键（`RENDERER`）没有界面入口。
- 两处页面打开期间都不随状态实时刷新；重新打开即可看到最新状态。

### Scenario: quick-open row while local agents are off

Acceptance: A4

WHEN 本机代理总开关关闭，THEN 快捷键设置里「打开本机 AI 代理」一行显示「打开『本机 AI 代理』后生效」，不显示「快捷键注册失败，可能被系统占用」。打开总开关后，这一行恢复为不带状态文字的可用状态。

### Scenario: plugin shortcuts follow the plugin

Acceptance: A8

WHEN 一个插件被停用（或处于崩溃、加载失败、已卸载等没有运行的状态），THEN 用户绑定到它功能上的快捷键在插件详情页的功能卡片上显示「所属功能或插件未运行」，这个快捷键和插件自己注册的快捷键都不再向系统注册。WHEN 插件重新启用并运行，THEN 重新打开插件详情页，卡片不再显示这句，按键重新注册。
