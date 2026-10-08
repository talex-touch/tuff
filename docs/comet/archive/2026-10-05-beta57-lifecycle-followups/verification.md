---
generated_from_state_version: 10
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-10-05T06:14:47.038Z
- 摘要: 新的独立只读Verifier已获Runtime接受verifier-started；完整A1–A8各恰好一项passed。源代码与消费端、正式检查及真实Electron/ego/PiRPC/native JSONL/宿主SQLite证据交叉一致；原7项Runtime检查有效复用，仅由Runtime补齐2项缺失保留边界，共9项检查、444项测试通过。无本候选引入的可证实阻塞缺陷；真实运行及旁路文本/权限夹具/OS触发覆盖限制已如实列风险。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **A1｜系统快捷键持久化**：在隔离宿主中通过现有设置入口关闭一项系统快捷键，正常退出并重启后配置和状态仍为关闭、该项不注册；重新启用后再次重启仍为启用。录制输入框临时 disableAll/enableAll 不改用户保存的启用选择。 | 独立核对 global-shortcon.ts:406-451、908-926、ShortcutStorage 按值/替换写入与 StorageModule.saveConfig:789-803；Runtime core-regression 的 durable user choices/FlatKeyInput 与真实SQLite冷写回归通过。真实隔离证据 system-user-disable-keyboard.log 显示现有设置开关保存 false，feature-fixed-bind-restart-and-ui-rebind.log 显示正常退出重启后 core.box.toggle 仍 disabled；system-user-enable-keyboard.log 与 feature-clear-and-system-enable-survive-restart.log 显示重新启用并重启仍 active。只读 SQLite 最终确认 core.box.toggle=Control+F20、enabled=1、shortcut-setting.ini revision=24；临时 disableAll/enableAll 不写用户开关由当前实现及正式回归证明。 |
| A2 | passed | brief.md | **A2｜功能快捷键持久化**：通过插件功能卡片绑定、改绑和清除快捷键，每一步正常退出重启后配置与显示一致；所属插件停用/恢复不丢绑定，保存失败不显示成功。保留存储读取按值隔离，不能靠暴露可变内部数组修复。 | ShortcutStorage:27-32、60-112 先保存成功后发布替换值，明确 success:false 或抛错保留原值；FEATURE 键与 enabled 一次写入，所有公开读取返回深副本。真实 feature-real-bind-after-cold-revision-fix.log、feature-fixed-bind-restart-and-ui-rebind.log、feature-rebind-restored-and-ui-clear.log、feature-clear-and-system-enable-survive-restart.log 分别证明从现有卡片绑定 Control+F18、正常重启后改绑 Control+F19、重启后清除、再次重启为空；feature-card-live-stop-recovery.log 证明插件停用/恢复保留键。Runtime utils-regression 15项、core-regression 中实际SQLite/LRU/reopen/stop-flush、失败不泄漏及卡片失败反馈通过；移除冷revision恢复的负控4项按预期失败。 |
| A3 | passed | brief.md | **A3｜Pi 最终完成时序**：agent_end 且 willRetry=true 时不进入原生会话核对、不提交最终 head、不提前完成任务；真正的 agent_settled 或不再重试的 agent_end 后按既有规则核对一次。失败、取消和旧/重复事件不产生迟到的成功完成。 | 核对 provider-registry.ts:293-320 的 willRetry/failed 解码与消费端 index.ts:1022-1089、1275-1393：重试终止不发最终 get_entries，失败终态 PROCESS_EXITED，取消及 completionReady/verificationRequested 防迟到及重复推进。pi-rpc-frames.jsonl/chronology 的真实Pi0.84.3成功run3在 willRetry=true 后继续回答，直到最终agent_end/settled才发恰好一次 tuff-after；失败run2整个重试/耗尽没有 tuff-after，pi-final-failure-after.log 仅 failed PROCESS_EXITED。独立只读核对真实Pi JSONL及宿主SQLite：失败session c24f091f的head保持5b14e736，成功session d19f861f推进389eb587，与RPC叶节点一致。Runtime core-regression 的Pi最终结束、耗尽、协议失败、重复/旧事件、重试中取消和原生核对悬挂期间取消回归均通过。既有失败预览文本累积明确列风险，不扩大已确认时序范围。 |
| A4 | passed | brief.md | **A4｜设置页实时状态**：快捷键对话框保持打开，用户切换所属系统功能、关闭/启用记录或改变冲突状态时，其启用值、按键及状态文案自动更新，包括有效按键仍为 null 的状态原因变化；不必关闭重开，不覆盖正在保存的选择或被迟到响应回滚。 | global-shortcon.ts:1210-1235发布包含用户启用值、配置/有效键、status/reason/conflict/warnings的完整可见签名，ShortconApi.onChanged消费现有事件。SettingTools.vue:375-393、435-554、732-762订阅刷新，以读取序号和行保存代次拒绝旧结果，保存中保留该行，卸载解除订阅。settings-live-null-state-transition.log证明同一个保持打开的真实对话框，local-ai-cli.quick-open有效键前后均null而文案从开关关闭提示转为已停用；截图仅辅助确认可见界面。Runtime 设置页11项回归证明按键/启用/冲突更新、乱序读取、跨保存边界和旧保存拒绝不回滚新选择、失败反馈及卸载隔离。 |
| A5 | passed | brief.md | **A5｜插件页实时状态**：插件功能卡片及插件详情快捷键列表保持打开，插件启停/崩溃/恢复、绑定变化或冲突变化后自动显示宿主最新值；切换插件/功能和卸载组件时不让旧请求或订阅污染当前页面，保留原来的失败回滚与权限边界。 | PluginFeatureDetailCard.vue:143-230与PluginDetails.vue:214-267、331-355消费宿主事件，按读取请求、保存代次及插件/功能身份隔离旧读/写，并在卸载解除订阅；原失败回滚保留。feature-card-live-stop-recovery.log证明保持打开的真实卡片在停止/恢复时保持Control+F18且runtime-missing提示出现/消失；plugin-list-real-notification-binding-direct-ui.log证明同一真实详情列表在宿主通知后从Control+F22更新Control+F23，截图辅助确认。Runtime功能卡片14项/详情列表11项覆盖冲突/警告/恢复/改绑/清除、身份切换、乱序、失败回滚及卸载。列表真实证据是显式disabled RENDERER夹具，非插件权限授权成功；host-only边界另经当前allowlist/消费路由及追加Runtime回归确认。 |
| A6 | passed | brief.md | **A6｜多个插件合并注册**：至少两个不同插件在同一个既有合并窗口内从未运行变为运行，只发生一轮系统重新注册且两个插件的快捷键都可用；后续窗口仍会重新分类，ENABLED 与 ACTIVE 互转不额外注册，销毁模块会取消待处理批次。永久回归必须在移除合并守卫时失败，不用无状态翻转的重复事件凑覆盖。 | global-shortcon.ts:1533-1552保留100ms批次守卫及真实isRunningStatus分类，读取所有插件最终状态，ENABLED/ACTIVE互转忽略，销毁解除监听并清timer。Runtime core-regression中的永久回归以两个不同插件DISABLED/CRASHED变为ENABLED/ACTIVE，验证首窗口一轮和两个键、下一窗口重新分类、运行态互转及销毁取消。plugin-merge-negative-control.log明确移除if(timer)return后该测试在排空窗口观测2轮而失败。real-native-two-plugin-registration-drained.log以不改native行为的观察器，在停用窗口排空后并发启用两个真实插件，registrationRounds=1且Control+F18/Control+F19均native已注册。未宣称OS物理按键触发。 |
| A7 | passed | brief.md | **A7｜应用绑定占用一致**：停用、缺失或未运行插件的 FEATURE/RENDERER 记录没有注册按键时，不阻止应用绑定该键、不弹虚假占用确认；实际运行的插件或系统绑定仍报告真实冲突，强制确认及保存失败回滚语义保持不变。 | global-shortcon.ts:644-663的占用预检与注册循环:1005-1015共用owningPlugin/isRunningStatus，缺失/disabled/crashed FEATURE和RENDERER不再作为持有者。Runtime core-regression永久回归覆盖两个不同owner的缺失/停用/崩溃、运行插件及系统真实冲突、force确认、拒收保存保留旧回调和AppManagedEntryActionsService失败回滚。real-app-released-plugin-key-bind.log证明真实AppIndex应用服务在运行插件时报告shortcut-conflict，停止后同键接受绑定success/updated并可正常清除。 |
| A8 | passed | brief.md | **A8｜真实验收与保留契约**：相关现有回归、类型检查和定向 lint 通过；真实隔离 Electron 证明持久化/重启和宿主状态刷新，ego 验证可见界面，真实 Pi RPC/原生会话流程证明重试时序。原有 CLI 查找、只复用凭据、总开关默认关闭、原生会话缺失/冲突不可重试、插件 host-only 和回调权限契约不回退；测试和截图不代替实际操作结果。 | 独立读取完整brief/两个Spec、候选源、消费派发、7项原Runtime记录及实际运行证据后判定；候选bb1adc56-551c-488e-9485-74757b298c4b、根/private/tmp/tuff-beta57-lifecycle-followups、iteration1/attempt1/stateVersion5匹配。复用原7项正式检查：21文件369测试、Utils15测试、node/web类型、两项定向lint及whitespace均passed；仅为原计划未覆盖的fnm/Dock和权限/host-only保留边界，通过Runtime request-checks追加2项（3文件52测试及8测试）全部passed，总444测试。真实Electron UI操作/正常退出重启、Ego可见界面、PiRPC/native文件及SQLite head交叉证据有效，不以ready或截图冒充操作。CLI查找/默认关闭/只复用CLI凭据、原生MISSING/CONFLICT不可重试、host-only和callback权限由当前源与正式回归保持。所有路径属私有/tmp，最终app.quit及Ego空间218关闭记录已核对；生产付费Provider及OS物理全局快捷键不在本证据覆盖。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| 完整相关宿主与渲染回归 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/apps/core-app/node_modules/.bin/vitest run src/main/modules/global-shortcon.test.ts src/main/modules/local-ai-cli src/main/modules/storage src/main/modules/ai/providers/pi-cli-runtime.test.ts src/main/modules/box-tool/addon/apps/services/app-managed-entry-actions-service.test.ts src/renderer/src/components/base/input/FlatKeyInput.test.ts src/renderer/src/views/base/settings/SettingTools.shortcut-status.test.ts src/renderer/src/views/base/settings/SettingTools.home-recommendations.test.ts src/renderer/src/views/base/settings/SettingTools.quickops.test.ts src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.shortcut-status.test.ts src/renderer/src/components/plugin/tabs/PluginDetails.shortcut-status.test.ts | apps/core-app | passed | 0 | 6302 ms |
| 真实快捷键存储回归 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/node_modules/.bin/vitest run __tests__/shortcut-storage.test.ts | packages/utils | passed | 0 | 430 ms |
| 主进程类型契约 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node /private/tmp/tuff-beta57-lifecycle-followups/apps/core-app/node_modules/typescript/bin/tsc --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 14826 ms |
| 渲染及相关widget类型契约 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/apps/core-app/node_modules/.bin/vue-tsc --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 14794 ms |
| 定向CoreApp lint | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/apps/core-app/node_modules/.bin/eslint --max-warnings=0 src/main/modules/global-shortcon.ts src/main/modules/local-ai-cli/index.ts src/main/modules/local-ai-cli/provider-registry.ts src/renderer/src/views/base/settings/SettingTools.vue src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue src/renderer/src/components/plugin/tabs/PluginDetails.vue src/main/modules/storage/index.ts src/main/modules/global-shortcon.test.ts src/main/modules/local-ai-cli/index.test.ts src/renderer/src/views/base/settings/SettingTools.shortcut-status.test.ts src/renderer/src/views/base/settings/SettingTools.home-recommendations.test.ts src/renderer/src/views/base/settings/SettingTools.quickops.test.ts src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.shortcut-status.test.ts src/renderer/src/components/plugin/tabs/PluginDetails.shortcut-status.test.ts src/main/modules/storage/index.test.ts | apps/core-app | passed | 0 | 2478 ms |
| 定向Utils lint | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/node_modules/.bin/eslint --max-warnings=0 common/storage/shortcut-storage.ts __tests__/shortcut-storage.test.ts | packages/utils | passed | 0 | 1555 ms |
| 变更空白门禁 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/git diff --check | . | passed | 0 | 38 ms |
| A8缺失的fnm/Dock查找与权限保留回归 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/apps/core-app/node_modules/.bin/vitest run src/main/modules/ai/providers/cli/cli-executable.test.ts src/main/modules/permission/index.test.ts src/main/modules/permission/permission-guard.test.ts | apps/core-app | passed | 0 | 1226 ms |
| A8缺失的插件默认拒绝与host-only传输回归 | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PATH=/Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin:/opt/homebrew/bin:/usr/bin:/bin /private/tmp/tuff-beta57-lifecycle-followups/node_modules/.bin/vitest run __tests__/plugin-facing-events.test.ts | packages/utils | passed | 0 | 693 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- 定向消费者回归、真实SQLite冷保存/清除与mutation负控: passed — 源数据日志见acceptance_review；首次夹具失败已修正，Pi47与Storage12最终通过，Utils15通过，两个负控均按预期失败。
- 开发期node/web类型契约: passed — /tmp/tuff-beta57-lifecycle-evidence-1004/dev-web-contract-check-fixed.log
- 真实Electron、ego与PiRPC路径: passed — 仅私有/tmp profile、受控零成本模型服务与显式测试记录，不宣称真实用户profile或生产发布验收。
- 已知限制: 没有注入OS物理全局快捷键；实际native isRegistered与注册轮数已记录，不以CDP键盘事件冒充OS触发。
- 已知限制: Pi真实CLI与原生会话已使用受控loopback上游，不调用真实付费模型；CLI凭据边界原样保留。
- 已知限制: 插件详情列表真实读取/通知更新使用显式种下的disabled RENDERER配置，不把该夹具当作插件权限授权成功。
- 已知限制: 旁路观察：既有LocalAI任务文本累加仍保留失败尝试的预览；本次只修完成/核对时序，不扩展文字回滚协议。既有首页聊天路径未改。
- 已知限制: 尚未完成其他并发change集成、用户接受结果/Archive确认或beta发布，当前不创建tag。

## 阻塞项

_无。_

## 风险与跳过的工作

- 真实Pi0.84.3对受控loopback零成本SSE模型运行；并未验收生产付费Provider或真实远程模型服务。
- 未注入OS物理全局快捷键；证据证明真实native注册、isRegistered和合并轮数，不把CDP键盘录制当作OS触发。
- 插件详情列表的真实刷新使用显式disabled RENDERER配置夹具；不代表插件SDK权限授权或回调注册成功。
- 既有LocalAI任务正文仍累积失败尝试预览，真实成功输出ATTEMPT_PREVIEWLIFECYCLE_RETRY_OK；本次已确认仅验收完成/核对时序，该旁路文本问题未修且未隐瞒。
- 正式回归日志含既有Vue stub缺props/injection和预期错误负例噪音；命令退出0且全部断言通过，无安装/formatter/真实用户profile写入。
- 本结论只覆盖本候选A1–A8；其他并发change、集成收敛、用户接受/Archive、beta发布和tag均未完成且不由本Verifier授权。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 新的独立只读Verifier已获Runtime接受verifier-started；完整A1–A8各恰好一项passed。源代码与消费端、正式检查及真实Electron/ego/PiRPC/native JSONL/宿主SQLite证据交叉一致；原7项Runtime检查有效复用，仅由Runtime补齐2项缺失保留边界，共9项检查、444项测试通过。无本候选引入的可证实阻塞缺陷；真实运行及旁路文本/权限夹具/OS触发覆盖限制已如实列风险。 | 2026-10-05T06:14:47.038Z |



## 结论

新的独立只读Verifier已获Runtime接受verifier-started；完整A1–A8各恰好一项passed。源代码与消费端、正式检查及真实Electron/ego/PiRPC/native JSONL/宿主SQLite证据交叉一致；原7项Runtime检查有效复用，仅由Runtime补齐2项缺失保留边界，共9项检查、444项测试通过。无本候选引入的可证实阻塞缺陷；真实运行及旁路文本/权限夹具/OS触发覆盖限制已如实列风险。
