---
generated_from_state_version: 14
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 3
- 验证器尝试次数: 1
- 完成时间: 2026-10-06T19:07:50.145Z
- 摘要: 8 项全部通过。这是修复后的第 3 轮，我在隔离 profile 的真实 Electron（候选 90671de15）上用自己写的探针逐项复核，没有沿用前几轮的结论。上一轮 A8 的失败路径已经修复：模型搜索框的清除键用 Enter 或 Space 清空后，焦点留在搜索框，方向键可用，Esc 回到胶囊。模式弹层用键盘按「重试」成功后，焦点交给当前行。三个弹层里，焦点掉到页面后按 Esc 也会回到胶囊。四种主题、窄工具条、短窗、纯键盘和减少动态效果下的表现都符合规格。需要如实说明的限制：听写用的是识别器替身；首载骨架是模拟的；「重启后保留」没有亲自重启；锁定态和读取失败等状态用页面标志或替身制造。另有几处非阻断问题：弹层是非模态的，Tab 或 Shift+Tab 移出后按 Esc 不回胶囊；TxSwitch 残影；深色主题下确认提示的对比度约 4.1:1；顶栏胶囊的名称不含模型名。核查结束后，实例已恢复为 opus、推理强度自动、自动审阅、对话、profile 开启、无测试会话、右侧面板关闭、深色非高对比。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **A1｜工具条**：打开 `/home`，权限、模式、模型胶囊始终显示图标和文字，平时透明、悬停才出底色，没有彩色底和描边，也没有「权限 ·」「Agent ·」前缀；「完全允许」的图标和文字是警示色；工具条窄于 520px 时，文字胶囊折叠为图标，可访问名称仍含完整状态。 | 真机（隔离 profile，我自己的探针 s1、s7）：静止态三枚胶囊都有 15px 图标和文字（权限「自动审阅」、模式「对话」、模型「opus」；自动选择时输入框和顶栏两枚模型胶囊都显示魔杖图标和「Tuff 智能」）；背景 rgba(0,0,0,0)、边框 0、无阴影、transition 0s；可见文字没有「权限 ·」「Agent ·」前缀，切到 profile 后模式胶囊只显示「Tuff Pi Coordinator」和机器人图标。悬停后第一帧即为 --shell-surface-2（深色 rgb(44,44,46)），悬停期间只有这一个取值，没有渐变。「完全允许」时图标和文字都是 --shell-danger（深色 rgb(224,101,92)、浅色 rgb(196,52,43)、深色高对比 rgb(253,164,175)、浅色高对比 rgb(180,35,24)）。打开右侧面板使工具条为 400px 后，四种主题下权限、模式胶囊都折叠成 32px 图标键并隐藏文字，可访问名称仍为「权限 · 自动审阅」「会话模式 · 对话」；完全允许时为「权限 · 完全允许」，图标仍是警示色；模型胶囊保留文字。 |
| A2 | passed | brief.md | **A2｜换档不变形**：在任一弹层换档后，胶囊在同一帧显示新图标和新文字，没有模糊、宽度补间和底色过渡；按下反馈保留；弹层沿用全局 expand 展开。 | 用 rAF 逐帧采样（s1）：权限「自动审阅→禁用」「禁用→完全允许」、模式「对话→Tuff Pi Coordinator」、模型「opus→haiku」四次换档，标签和图标都在同一帧变为新值，前一帧仍是旧值；宽度从旧值直接跳到新值（93→67、67→93、67→158.29、88.37→91.27），没有中间宽度；filter 始终 none，opacity 始终 1，胶囊子树没有动画（模型胶囊只有弹层收起时箭头的 rotate）。完全允许的变色同帧完成，transition 为 0s。按下三枚胶囊都有 WAAPI scale 1→0.9、90ms 的反馈。三个弹层打开时是全局锚点的 translate3d+scale 弹簧，各约 49 个变化帧。减少动态效果下（s8），三个弹层打开时 transform 恒为 none，尺寸和位置不变，按下也没有缩放。 |
| A3 | passed | brief.md | **A3｜权限弹层**：三行只有图标、名称和当前项的勾，悬停显示原说明；「自动审阅」时末尾有「重置已记住的授权」；「完全允许」第一次点击只让该行变红，并提示「再点一次确认：之后所有工具调用都不再询问」，第二次点击才生效；关闭弹层后待确认状态取消。 | 真机指针与键盘（s2、s6、s7）：当前为自动审阅时，三行「禁用 / 自动审阅 / 完全允许」各只有图标和一行名称，当前行有勾，完全允许行的图标为警示色；原说明放在各行的 title 里（例如「允许助手调用工具且不再征求同意——包括破坏性的 MCP 工具」）。分隔线下有「重置已记住的授权」，禁用和完全允许时没有这一行；点重置后弹层关闭，焦点回胶囊，并出现「已清除本会话记住的授权」。第一次点击（或按 Enter）「完全允许」时档位不变、弹层不关，该行变为 --shell-danger-soft 底，档位名下出现红色的「再点一次确认：之后所有工具调用都不再询问」，aria-describedby 指向这句提示，状态区同步播报；第二次才切换到完全允许并关闭弹层，焦点回到胶囊，胶囊变为警示色。待确认时按 Esc 关闭、点击外部关闭后重开，或者改选「禁用」（立即生效并关闭）后重开，该行都恢复为普通状态。四种主题下都观察到同样的表现。 |
| A4 | passed | brief.md | **A4｜模式弹层**：第一层只有「对话」和已启用的 profile，选 profile 即切到 Agent 并使用它；「管理智能体」进入二级视图，列出全部 profile 的摘要和启停开关，关掉的 profile 不再出现在第一层；已有历史时底部有一行分支提示；回复进行中不能切；无 profile、全部关闭、读取失败时各有文字和入口。 | 真机（s3）：第一层只有「对话 ✓」「Tuff Pi Coordinator」和「管理智能体」，没有开关和摘要。「管理智能体」二级视图列出 profile 的摘要「pi-core · 10 个工具 · 运行前询问」和开关。用指针关掉开关后，经真实 orchestrator 保存，profiles:list 读回 default-pi:false；返回第一层只剩「对话」和「管理智能体」，并提示「所有 Agent profile 均已关闭，在「管理智能体」里开启一个即可使用 Agent 模式。」；重开总是回到第一层；用键盘 Space 重新开启后，存储读回 true。在空白 Home 选这个 profile，胶囊变为机器人图标加「Tuff Pi Coordinator」，草稿设置为 agent + default-pi；选「对话」可以切回。用 conversation:api:save 写入一个有两条历史的会话（没有调用模型）：底部显示「切换后在新分支里继续」；用键盘选 profile 后，真实 fork 出 agent + default-pi 的新会话（2 条消息），胶囊显示 profile 名，焦点在胶囊上。用页面的 branching 标志驱动 locked 时，profile 行为 aria-disabled，方向键跳过它，提示改为「回复结束后才能切换」；用指针按锁定行没有任何变化，按 Esc 回到胶囊。关掉该会话正在使用的 profile 后，胶囊的图标和文字变为警示色，菜单里提示「此会话使用的 profile 已关闭或不存在，请另选一个。」。用页面内的 profiles:list 替身制造的状态：读取失败时显示「无法读取 Agent profile。」和「重试」；没有 profile 时显示「还没有任何 Agent profile，Agent 模式无可运行的配置。」，入口是「管理智能体」；首次读取时显示骨架行。测试会话已删除，profile 已恢复为开启。 |
| A5 | passed | brief.md | **A5｜模型弹层结构**：输入框和顶栏的模型胶囊打开同一个双栏弹层；打开即见完整搜索框并获得焦点；左栏有自动选择、最近使用和按「服务 · 渠道」排列的来源及模型数，右栏是所选来源的模型；只有双栏滚动，推理强度固定在底部；设置键打开「智能 · 渠道」设置；没有筛选条、每行副标题、字母占位、★ 和 ⌘N。 | 真机（s4、s4c、s9、s11、s7）：输入框和顶栏的模型胶囊打开同一个弹层，左栏内容一致。输入框的弹层在胶囊上方右对齐（弹层底 469 小于胶囊顶 477，右缘都是 952），顶栏的弹层在胶囊下方左对齐（左缘都是 280），宽 482。打开后搜索框完整可见并获得焦点。左栏依次是「自动选择」（动作，自动时带勾）、「最近使用」、分隔线、Claude Code 3、Codex 8，OMP 组头下的 ccs 2 / codex 5 / kimi 2 / m 2 / qwen 1，以及 Pi 组头下的 anthropic 16 / codex 4 / cpa 23 / kimi 2 / xai 4；逐个点选后，12 个来源的数量都与右栏行数一致，来源的 title 为「服务 · 渠道」。弹层卡片 scrollHeight 等于 clientHeight（414/414）；滚轮只滚动左栏（滚到 197）或右栏（滚到底 455），搜索框和底部「推理强度 自动/低/中/高/极高」始终完整；在 1100×680 的短窗里，卡片缩到 391px，仍不整块滚动。设置键会关闭弹层并进入 #/setting/intelligence/channels（智能 · 模型渠道）。弹层里没有筛选条、副标题、字母占位（行图标都是图标组件，不含文字）、★ 和 ⌘ 键位。另外核对了：选了档位时胶囊显示「opus · 高」；路线不支持推理强度时整排禁用，并说明「该模型不支持推理强度」；自动选择时说明生效条件。 |
| A6 | passed | brief.md | **A6｜来源、最近使用与搜索**：打开时停在当前模型的来源；「最近使用」记录最近选中的 5 个模型，最新的在前，重启后保留，行尾带来源标签；搜索跨来源出结果并按来源分组，左栏变淡，清空后恢复；方向键在两栏间移动，Enter 选中并关闭，Esc 关闭并把焦点还给胶囊；首次加载显示骨架。 | 真机（s4、s4b、s6、r12）：打开时停在当前模型所在的来源（sonnet 停在 Claude Code，grok-4.3 停在 Pi·xai，远处的来源和已选行会滚动到可见位置）；自动选择且「最近使用」非空时停在「最近使用」。依次选中 6 个不同的模型后，「最近使用」是最新的 5 个，最新的在前，没有重复，最早选的 haiku 被挤出；选自动选择不计入。行尾标签依次为「Claude Code」「Pi · cpa」「OMP · qwen」「OMP · kimi」「Codex」；main 进程存储和磁盘上的 app-setting.ini 都即时写入。搜索「qwen」跨来源出结果，按「OMP (local CLI) · m」「OMP (local CLI) · qwen」分组，左栏 opacity 0.45 且 inert；搜索不区分大小写，按渠道名（ccs）和服务名（claude code）也能匹配；没有匹配时显示「没有匹配的模型」；用 Backspace 或清除键清空后，左栏恢复搜索前的选中项（xai）。键盘：在搜索框按 ↓ 进入右栏，↑/↓/Home/End 移动，← 到左栏当前项，在左栏按 ↑/↓ 时右栏随之切换，→ 回到右栏，Enter 选中并关闭，焦点回到模型胶囊；在搜索框、左栏、右栏、推理强度和设置键上按 Esc，都会关闭弹层并回到胶囊；顶栏胶囊打开的弹层按 Esc 回到顶栏胶囊。首次加载骨架：左栏 4 行（30px）、右栏 5 行（32px），与真实行同高，并带 aria-busy；放行后出现真实行，并停在当前来源。这个骨架是挂起请求并重置 loaded 模拟出来的。「重启后保留」采用 builder 的重启前后读数（11:30:49 与 11:31:51 的列表一致），我核对了实例进程确实在 11:31:32 启动。 |
| A7 | passed | brief.md | **A7｜听写态**：点麦克风后，输入框底部出现 `TxVoiceBeam` 辉光并随电平起伏；附件、权限、模式、排队键和模型隐藏且不可聚焦；左侧依次显示「正在准备麦克风...」「录音点 + 正在听写 + 计时 + Esc 取消」「正在识别」，「正在识别」时辉光收拢成往返扫动的光束；停止、结束并发送、Esc 取消的行为与现在一致；结束后辉光淡出、工具条恢复；听写期间空输入框的呼吸光不叠加；减少动态效果时，辉光只随声音大小变化，扫光停在中间。 | 真机，识别器是页面内的替身（s5，普通动效和减少动态效果各跑一轮）。点麦克风后，TxVoiceBeam 覆盖层出现 data-active（absolute、z-index 0、pointer-events none），7 个瓣的颜色取自 --home-live-stops。左侧簇（附件、权限、模式，以及排队键所在的槽）和模型槽都是 opacity 0、inert、aria-hidden、pointer-events none；Tab 只经过「结束听写」「结束听写并发送」就离开输入框。左侧依次显示「正在准备麦克风...」「● 正在听写 0:01 · Esc 取消」「正在识别」，并通过状态区播报。听写中 --vb-level 随电平帧变化（0.505–0.883，共 38 个取值）；停止后出现 data-processing，--vb-cx 在 −193.8 到 152.4px 之间往返，麦克风键变为转圈且 aria-disabled。识别完成后文字留在输入框，辉光约 0.5 秒淡出，工具条恢复。按 Esc 取消后，草稿恢复为听写前的「原来的草稿」；用键盘 Enter 开始、Esc 取消，焦点留在麦克风键上。「结束听写并发送」会停止会话并提交识别出的文字（submit 在页面内被拦截，没有调用模型）。听写期间，空输入框的呼吸光 TxBorderBeam 不处于 active。减少动态效果下，电平仍在驱动（38 个取值），--vb-cx 和色相恒为 0，控件的隐藏与恢复没有过渡。 |
| A8 | passed | brief.md | **A8｜真实应用**：在隔离 profile 的真实 Electron 中，以上行为在浅色、深色、高对比度、宽窄窗口、纯键盘操作（Tab 进入、Enter 打开、方向键、Esc 关闭并回焦）和减少动态效果下都可观察到。 | 在隔离 profile 的真实 Electron 上核查（CDP 9341，渲染层由 dev server 提供，内容是候选 90671de15 的代码）。浅色、深色、深色高对比、浅色高对比四种主题（s7，每次切换主题后整页重载）下，工具条、完全允许的警示色、权限待确认、管理智能体、模型弹层和听写各状态都正确呈现，键盘焦点环可见（:focus-visible，2px 实线）。宽窗 1100px 和工具条 400px 的窄态下，胶囊会折叠，三个弹层都在窗口内，按 Esc 回到各自的胶囊；1100×680 的短窗下模型弹层完整。纯键盘（s6）：从输入框 Tab 到权限胶囊，按 Enter 打开并落在当前行，↑/↓/Home/End 移动，按 Esc 关闭并回到胶囊。Tab 到模式胶囊后按 Space 打开，↓ 到「管理智能体」按 Enter 进入二级，Tab 到开关，Shift+Tab 回到标题行，按 Enter 返回，按 Esc 回到胶囊。模型胶囊按 Enter 打开后输入查询，Tab 到清除键按 Enter 或 Space 清空，焦点留在搜索框，↓/←/↑/→ 在两栏间移动，按 Esc 回到胶囊。上一轮不通过的这条路径已修复，我复跑上一轮的 q6（r12）也通过。推理强度用方向键移动、按 Enter 选择，弹层不会关闭；按 Enter 选自动选择后，焦点回到胶囊。读取失败时 Tab 到「重试」按 Enter：仍然失败时焦点留在重试，成功后焦点交给当前行，方向键可用，按 Esc 回到胶囊（s3）。用指针按锁定行使焦点落到 body 后，按 Esc 仍回到胶囊。减少动态效果下（s8、s5），弹层不做位移与缩放，按下没有缩放，辉光只随声音变化，扫光停在中间。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| core-app vitest（home / conversation / shortcuts / lang） | node_modules/vitest/vitest.mjs run src/renderer/src/views/base/home src/renderer/src/modules/conversation src/renderer/src/modules/shortcuts src/renderer/src/modules/lang | apps/core-app | passed | 0 | 4135 ms |
| vue-tsc 渲染层类型检查 | node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 16150 ms |
| eslint（改动文件，零警告） | node_modules/eslint/bin/eslint.js --max-warnings 0 src/renderer/src/modules/conversation/conversation-settings.ts src/renderer/src/modules/conversation/useAgentWorkspace.profile-save.test.ts src/renderer/src/modules/conversation/useAgentWorkspace.ts src/renderer/src/modules/conversation/useRecentModels.test.ts src/renderer/src/modules/conversation/useRecentModels.ts src/renderer/src/modules/shortcuts/shortcut-chord.ts src/renderer/src/views/base/home/HomeModelMenu.test.ts src/renderer/src/views/base/home/HomeModelMenu.vue src/renderer/src/views/base/home/HomePage.vue src/renderer/src/views/base/home/HomePermissionMenu.test.ts src/renderer/src/views/base/home/HomePermissionMenu.vue src/renderer/src/views/base/home/composer/ComposerChip.test.ts src/renderer/src/views/base/home/composer/ComposerChip.vue src/renderer/src/views/base/home/composer/ComposerMic.test.ts src/renderer/src/views/base/home/composer/ComposerMic.vue src/renderer/src/views/base/home/composer/ComposerModelPill.vue src/renderer/src/views/base/home/composer/ComposerToolbar.test.ts src/renderer/src/views/base/home/composer/ComposerToolbar.vue src/renderer/src/views/base/home/composer/composer-motion.ts src/renderer/src/views/base/home/composer/composer-style-contract.test.ts src/renderer/src/views/base/home/composer/model-pill.test.ts src/renderer/src/views/base/home/composer/model-pill.ts src/renderer/src/views/base/home/composer/voice-glow.test.ts src/renderer/src/views/base/home/composer/voice-glow.ts src/renderer/src/views/base/home/escape-returns-focus.ts src/renderer/src/views/base/home/focus-when-shown.ts src/renderer/src/views/base/home/workspace/HomeWorkspaceModeMenu.test.ts src/renderer/src/views/base/home/workspace/HomeWorkspaceModeMenu.vue | apps/core-app | passed | 0 | 1639 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- core-app vitest：views/base/home（17 个文件 213 条）: passed — 本轮新增 4 条；5 个变异体、7 次定向运行的负对照都在目标断言处失败
- eslint（本轮 7 个改动文件，--max-warnings 0）: passed — 另经 pre-commit 的 lint-staged
- 真实应用证据 check-evidence.py（隔离 profile Electron + CDP）: passed — 92/92，输出在 /Users/talexdreamsoul/Workspace/docs/engineering/reports/composer-redesign/check-evidence.txt
- 完整 vitest / vue-tsc / eslint 计划: not-run — 按 Comet 约定交给 Runtime 在冻结候选上执行
- 含 TuffEx 预构建的 typecheck:web、Nexus 构建、全仓 lint: not-run — TuffEx 与 Nexus 未改动
- 已知限制: 听写没有用真实录音：隔离实例设了 TUFF_DISABLE_NATIVE_AUDIO=1，识别状态和电平帧由页面内替换的 transport（voice:api:get-recognition-status / voice:api:asr-stream）注入。呈现、状态序列和键盘行为来自真实组件，真实麦克风和识别引擎没有参与（brief「验证预期」要求如实写明）。
- 已知限制: 「结束并发送」的发送被拦截：agent-workspace:api:submit 在页面内被拒绝，证据是拦下的载荷文本，没有调用任何模型或 CLI。
- 已知限制: A4 的分支提示、回复进行中锁定、无 profile 和读取失败状态只由 HomeWorkspaceModeMenu.test.ts 覆盖：真机上制造这些状态要真实发送消息或破坏 profile 存储，没有做。真机覆盖了第一层列表、管理视图、开关保存（真实 orchestrator）、关闭后从第一层消失、选 profile 切 Agent、回到对话。
- 已知限制: 首次加载骨架和「选项晚到」是模拟的：挂起 intelligence:api:get-provider-model-options，并把模块的 loaded 拨回首次状态（真实首载太快，抓不到）；放行后走真实请求。
- 已知限制: 选项晚到前，用户如果已在面板里滚动、按键或点按，选中项仍按新数据重算，但两栏不再滚动，已选来源可能在视野外（a5-dark-late-load-hands-on.png）。这是有意的取舍：不和用户抢滚动位置。
- 已知限制: 验证脚本缺陷（本轮发现并已修正）：ev-a5-a6 和 ev-a5-late-load 的挂起包装直接调用了未绑定的 send，放行时抛错、旧列表原样保留；而且 ev-a5-a6 之后，同一页面里所有经 transport 的请求都会失败（模型列表刷新按设计静默保留旧数据，所以之前几轮没有暴露）。重启前各轮的证据都带着这个缺陷。本轮改为 bind(t)，并在这两个场景后重载页面，清空证据目录后整轮重跑。
- 已知限制: 工作区经过一次重启恢复：2026-10-06 重启清空了 /private/tmp，原 worktree、提交和 Comet 记录一起丢失。代码从 Claude Code file-history 和会话记录重放恢复为 1208a7683；Comet 记录用 native new 重建，Shape 由用户重新确认。重建时为通过 workspace-isolation 检查，临时移开了 4 个与本需求无关的孤儿 change 目录，登记后原样放回。
- 已知限制: 崩溃上报：重启前，旧测试 profile 的一份主进程崩溃 minidump 已上传 Sentry（statusCode 200）。第 4 轮新建 profile 后，在第一个实例启动约 10 秒时才写入 sentry-config.json {enabled:false}；服务订阅了这个配置，会立即关闭上报，但这 10 秒内是否发出过启动遥测，因日志已被重启覆盖而无法查证。此后每次启动日志都是 Sentry is disabled by configuration，profile 里没有 .dmp。旧 profile 启动约 30 秒后主进程 SIGSEGV 的问题在新 profile 上没有复现，原因未查明。
- 已知限制: 旁路的既有问题，没有改：深色高对比度下 --shell-primary-soft 与 --shell-primary 对比度约 1.3:1（全局 token，本需求只在 ComposerMic 的 html.contrast 下改用 primary + on-primary）；「模型渠道」设置页的文档级按键处理会吞掉之后的 Space 和方向键（证据脚本靠先跑键盘场景或重载规避）；TxDropdownMenu 的 initialFocus 在首帧因锚点 visibility:hidden 失效（CoreApp 用 focusWhenShown 规避，没有改 TuffEx）。
- 已知限制: TuffEx 没有改动：辉光直接复用已有的 TxVoiceBeam，所以没有 Nexus 文档和 demo 的同步改动。
- 已知限制: 窄窗折叠（≤520px）在浅色、深色高对比、浅色高对比三种主题下有截图和检查；普通深色主题只有听写态的窄窗截图（a7-dark-narrow-peak.png），折叠本身是同一条 @container 规则。
- 已知限制: 提交只在本地分支 task/feat/composer-redesign（1208a7683、121504b1e、389770b44、90671de15），没有推送；Comet 正式产物尚未提交（docs/comet/changes/composer-redesign/ 未跟踪）。
- 已知限制: TuffEx 既有问题（本轮发现，未改）：TxSwitch 的 .tuff-switch__track 和 __thumb 用了 transition: all 0.25s，visibility 也在过渡之列。锚点弹层收起后 clip 已是 hidden，开关的轨道和滑块仍会可见约 250ms，在原位置留下一个开关残影（逐帧采样：253ms 时 clip 和按钮已 hidden，track 和 thumb 仍 visible；900ms 时全部 hidden）。本次只在从「管理智能体」视图关闭弹层时出现。按机制推断，基线里开关所在的下拉同样存在这个残影，但没有在基线上实测。根治应在 TuffEx 把 transition 改成具体属性，并同步 Nexus 文档。
- 已知限制: 全局 accessibility.scss 有 [aria-disabled="true"], [disabled] { pointer-events: none }：按下被锁定的行时，点击会穿到后面不接焦点的元素上，焦点掉到 body。第 6 轮起三个弹层都靠共用的 Esc 判断回焦，真机已验证权限和模型弹层的指针路径。焦点掉到页面后，方向键在弹层里不起作用，要先按 Esc，或者用 Tab 重新进入；这一条只影响指针操作。
- 已知限制: 上一轮验收报告里的旁路问题，本轮没有处理：apps/core-app/scripts/coreapp-packaged-tool-confirmation-acceptance.ts 仍使用本次删除的选择器（.HomePermissionMenu-Pill、.is-info、ComposerChip 的 tx-text-transformer 层），再跑这份打包验收会失配（它不在 CI 中，模型菜单选择器在基线就已失配）；顶栏模型胶囊的可访问名称不含模型名（HomeTopBar.vue 未改，既有问题）；锚点弹层是非模态的，Tab 走完会离开弹层。
- 已知限制: 从有历史的对话选 profile 时，selectAgentProfile 先把 profileId 写进源会话（mode 仍为 chat），再 fork。这是因为 Main 的 fork 只替换 mode，属于有意设计，但会在源会话上留下持久化副作用；HomePage 里这段逻辑没有单测，只在上一轮验收中真机验证过一次。
- 已知限制: 上一轮验收报告里没有处理的风险：弹层是非模态的，Tab 走过最后一个控件会进入侧栏而弹层仍开着（锚点组件的既有行为，这时按 Esc，焦点留在用户移到的位置）；访问「模型渠道」设置页后 Space 和方向键被吞，重载才恢复（既有问题，模型弹层的设置键会直接进入这个页面）；高对比度下搜索框有圆角外框加输入框矩形框的双重焦点框（来自 TuffEx 的外观）。
- 已知限制: 从有历史的对话里选 profile 并 fork 到新会话后，焦点会落在哪里，本轮没有在真机上检查：那时页面要切到新会话，已经超出弹层自己的回焦范围。

## 阻塞项

_无。_

## 风险与跳过的工作

- A7 只用页面内的识别器替身验证：隔离实例设置了 TUFF_DISABLE_NATIVE_AUDIO=1，真实麦克风、主进程录音和识别引擎都没有参与。「结束并发送」的 agent-workspace:api:submit 在页面内被拦截，没有调用任何模型或 CLI。排队键的隐藏只按结构核对：它位于被 inert 的左侧簇里，没有制造 Main 忙且有草稿的真实状态。
- A6 的首次加载骨架是模拟的：挂起 get-provider-model-options 并重置 loaded。我尝试过不用替身：重载后 597ms 就点开弹层，第一帧已经有真实行，捕获不到真实首载的骨架。
- A6 的「重启后保留」我没有亲自重启（按要求不重启实例）。依据是 builder 的重启前后读数，以及吻合的进程启动时间；我自己核对了选中后 main 进程存储和磁盘上的 app-setting.ini 都即时写入。
- A4 的「回复进行中不能切」用页面 branching 标志驱动同一个 locked 属性观察，没有制造真实的 Main 忙碌。读取失败、无 profile、首读骨架都由页面内的 profiles:list 替身制造。分支提示和分支 fork 用 conversation:api:save 手工写入的会话验证（没有调用模型），测试会话已删除。从有历史的对话选 profile 时，源会话会被写入 profileId（mode 仍为 chat），这个持久化副作用本轮再次出现，属于有意设计，HomePage 里这段逻辑没有单测。
- 弹层是非模态的（锚点组件的既有行为）。在弹层里 Tab 过最后一项会进入侧栏「收起侧边栏」；在第一项按 Shift+Tab，焦点会跳到输入框的「发送」键。这两种情况下弹层都仍然开着，之后按 Esc 关闭，焦点留在用户移到的位置，不回到胶囊。实现有意这样处理，规格里「用键盘关闭时焦点回胶囊」没有单独写明这种情形。
- TuffEx TxSwitch 的残影（既有问题，本次未改）：从「管理智能体」视图关闭弹层后，开关的轨道和滑块会在原位置多显示一段时间。实测 clip 在 256ms 变为 hidden，track 到 497ms、thumb 到 747ms 才隐藏，330ms 截图里能看到一个完整的开关浮在输入框上。
- 深色（非高对比）主题下，「再点一次确认：之后所有工具调用都不再询问」这句提示（11px，--shell-danger 叠在 danger-soft 行底上）实测约 4.1:1，低于 WCAG AA 小字要求的 4.5:1。浅色约 4.6:1，浅色高对比约 5.4:1，深色高对比约 9.5:1。
- 两种高对比主题下，获得焦点的模型搜索框会同时显示圆角外框和输入元素自身的矩形焦点框，形成双重焦点框。这是外观问题，来自 TuffEx。
- 顶栏模型胶囊的可访问名称是「选择模型与推理强度」，不含可见的模型名，不满足 label-in-name。HomeTopBar.vue 本次未改动，属于既有问题。
- 访问「模型渠道」设置页后，它的文档级按键处理会吞掉 Space 和方向键，要整页重载才恢复（既有问题）。模型弹层的设置键会直接进入这个页面，所以用户回到 Home 后，弹层里的键盘操作会受影响。
- apps/core-app/scripts/coreapp-packaged-tool-confirmation-acceptance.ts 及其测试仍使用已删除的 .HomePermissionMenu-Pill / .is-info 选择器，再跑打包验收会失配。它不在本次验收范围内，builder 已记录。
- 模型选项加载完成前，已固定模型的胶囊暂时显示「Tuff 智能」和自动图标（在模拟首载时看到）。真实首载约 600ms 内完成，未解析时显示路由名称这一点是基线既有的逻辑。
- 主窗口最小宽度是 1100px（resizeTo(800,680) 后仍为 1100），所以「窄窗口」是打开右侧面板、让工具条变为 400px 来验证的；短窗只测到 1100×680。
- builder 证据脚本有几处偏松，我已用自己的探针补测：check-evidence 的「chips show icon + text」对模型胶囊来说，展开箭头就能满足条件；「完全允许 in the alarm hue」只比较它与模式胶囊颜色不同，不查图标；「label and width change in the same frame」不查图标；焦点扫描只向前 Tab，没有覆盖 Shift+Tab 和排在当前项之前的行。
- 检查覆盖：Runtime 绑定的 vitest（home、conversation、shortcuts、lang）、vue-tsc 渲染层和改动文件的 eslint 均已通过，我没有请求额外的 Runtime 检查。没有经 Runtime 执行的有：core-app 全量 vitest、含 TuffEx 预构建的 typecheck:web、Nexus 构建和全仓 lint（TuffEx 与 Nexus 未改动）。我只读核对过：改动文件里没有旧组件的 import（与 coreapp-ui-contract 门禁的规则一致），删除的模块和 i18n 键在 src 中没有残留引用。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A8 | 独立核查（只读）结论：A1–A7 通过，A8 不通过，整体 fail。我在隔离 profile 的真实 Electron 上用自己写的探针复核了 builder 的证据，并补测了深色窄态、模式和模型的逐帧换档、权限的键盘二次确认、有历史会话的真实分支、锁定态、读取失败/无 profile/首读骨架、减少动态效果下的弹层，以及听写态（识别器为页面内替身）。唯一的验收缺陷：在「管理智能体」里用键盘切换开关后焦点丢到 body，Esc 关闭弹层后不回到模式胶囊，不满足 A8 的「Esc 关闭并回焦」；该机制在基线已存在，但没有随新的二级视图处理。修复范围小，集中在 HomeWorkspaceModeMenu 的开关或回焦逻辑。核查结束后，实例已重载，状态已复原（opus、自动、自动审阅、对话、profile 开启、无测试会话），worktree、证据目录和 drafts 都没有写入。 | 2026-10-06T17:20:06.194Z |
| 1 | 2 | 1 | fail | A8 | 独立只读核查的结论：A1–A7 通过，A8 不通过，整体 fail。我在隔离 profile 的真实 Electron 上用自己写的探针（输出在 /private/tmp/tuff-composer-verify/verifier-r5）逐项复核。核查覆盖：三枚胶囊的静止、悬停、警示色和窄态；逐帧换档；权限二次确认（指针和键盘）；模式弹层的全部状态，包括有历史会话的真实 fork、锁定、读取失败、无 profile、骨架和两个 profile 的挂起保存；模型弹层的结构、来源、最近使用、搜索、键盘、设置键和矮窗；听写态（识别器为页面内替身）；四种主题与减少动态效果。上一轮的 A8 失败点（「管理智能体」切开关后焦点丢失、Esc 不回焦）已修复并在真机上确认。新发现的 A8 失败点在模型弹层：用键盘激活搜索框的清除键后焦点掉到 body，Esc 关闭弹层但不回到模型胶囊。机制与上一轮相同，基线已存在，修复范围很小（在 HomeModelMenu 沿用模式弹层的 Esc 兜底，或清空后把焦点放回输入框）。核查结束后实例已重载，状态已复原：深色、非高对比、opus、推理强度自动、自动审阅、对话、profile 开启、无测试会话、右侧面板关闭，最近使用的顺序和收藏都与核查前一致。worktree、证据目录和 drafts 都没有写入。 | 2026-10-06T18:14:48.837Z |
| 1 | 3 | 1 | pass | — | 8 项全部通过。这是修复后的第 3 轮，我在隔离 profile 的真实 Electron（候选 90671de15）上用自己写的探针逐项复核，没有沿用前几轮的结论。上一轮 A8 的失败路径已经修复：模型搜索框的清除键用 Enter 或 Space 清空后，焦点留在搜索框，方向键可用，Esc 回到胶囊。模式弹层用键盘按「重试」成功后，焦点交给当前行。三个弹层里，焦点掉到页面后按 Esc 也会回到胶囊。四种主题、窄工具条、短窗、纯键盘和减少动态效果下的表现都符合规格。需要如实说明的限制：听写用的是识别器替身；首载骨架是模拟的；「重启后保留」没有亲自重启；锁定态和读取失败等状态用页面标志或替身制造。另有几处非阻断问题：弹层是非模态的，Tab 或 Shift+Tab 移出后按 Esc 不回胶囊；TxSwitch 残影；深色主题下确认提示的对比度约 4.1:1；顶栏胶囊的名称不含模型名。核查结束后，实例已恢复为 opus、推理强度自动、自动审阅、对话、profile 开启、无测试会话、右侧面板关闭、深色非高对比。 | 2026-10-06T19:07:50.145Z |



## 结论

8 项全部通过。这是修复后的第 3 轮，我在隔离 profile 的真实 Electron（候选 90671de15）上用自己写的探针逐项复核，没有沿用前几轮的结论。上一轮 A8 的失败路径已经修复：模型搜索框的清除键用 Enter 或 Space 清空后，焦点留在搜索框，方向键可用，Esc 回到胶囊。模式弹层用键盘按「重试」成功后，焦点交给当前行。三个弹层里，焦点掉到页面后按 Esc 也会回到胶囊。四种主题、窄工具条、短窗、纯键盘和减少动态效果下的表现都符合规格。需要如实说明的限制：听写用的是识别器替身；首载骨架是模拟的；「重启后保留」没有亲自重启；锁定态和读取失败等状态用页面标志或替身制造。另有几处非阻断问题：弹层是非模态的，Tab 或 Shift+Tab 移出后按 Esc 不回胶囊；TxSwitch 残影；深色主题下确认提示的对比度约 4.1:1；顶栏胶囊的名称不含模型名。核查结束后，实例已恢复为 opus、推理强度自动、自动审阅、对话、profile 开启、无测试会话、右侧面板关闭、深色非高对比。
