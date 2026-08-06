# 执行计划 · 设置 v2.5 收口

行号引用见 `research/settings-groupblock-audit.md`(快照,实施时以现场为准)。每步完成跑 `apps/core-app` 内 `npm run typecheck`;步骤即提交边界,可独立 revert。

## Step 1 · TuffGroupBlock v2 升级(单独提交,全局观感切换)— ✅ 完成(2026-08-06)

- [x] TuffGroupBlock 重写:外置标签 12px(订正,见 design §1.1)、发丝线左缩进 16 右齐边(background-image 注入)、GSAP/展开记忆删除、collapse/icon props no-op、`#header-extra` 移外置标签行右端
- [x] TuffBlockSlot/TuffBlockLine/TuffBlockSwitch 对齐 C2/Row;行级 `#icon` 插槽保留(SettingUser 头像用例),仅 props no-op
- [x] SettingSkeleton 改建在 TuffGroupBlock 上
- [x] 巡检 75 处使用:`@toggle` 监听 0、`#header-extra` 外部使用 0;**行为变化仅 4 处默认折叠点从此常显**(PluginFeatureDetailCard.vue:468,489 的 JSON pre;IntelligencePromptsPage.vue:673,709)——v2 既定口径,可接受
- [x] typecheck:web EXIT=0;相关单测 5 文件 17 用例全绿
- [ ] 双主题实机目检(代理无渲染环境,归入 Step 6 收口走查)
- 备忘:IntelligenceAuditPage.vue:48,60,72,85 存在拼错的 `:default-expanded` prop(从未绑上,fallthrough attr),顺带记录不修;滑条行数值归 Step 2

## Step 2 · 外观页对齐 E0C1Zz — ✅ 完成(2026-08-06)

- [x] 壁纸面板 ×4 溶解为行式;最终组序:窗口效果 / CoreBox / 个性化(画板 4 行) / 壁纸(v-if,10 行) / 强调(+收编页底游离的主题帮助行) / 动效设置
- [x] `SectionItem` 瓦片、CoreBox 行(Beta chip 改 `TxTag`,`TxStatusBadge` 的 role=status 会把 Beta 当 live region 播报)对齐画板
- [x] 行为零变化的机器证明:v-model/@click/@change/:model-value 绑定集合与 HEAD 逐字节一致(24 个),TxSlider min/max/step 全一致
- [x] typecheck:web EXIT=0;eslint 4 文件 0 错;SectionItem.semantic.test 3/3
- [x] i18n +3 键(wallpaperGroup/wallpaperGroupDesc/coreBoxGroup);**主会话补齐画板文案对齐**:windowSection.title 窗口偏好→窗口效果、blur/opacity 值改「窗口模糊/窗口透明度」并新增 blurDesc/opacityDesc 两行描述(经核实 preload 的 `themeStyle.blur` 是存储对象属性非 i18n 键,改值安全)
- [x] 孤儿 `styles/sub/ThemePreviewIcon.vue` 已由主会话删除(11 处 #icon 用法随画板去图标而移除后,唯一使用方消失;grep 零引用)
- 偏离(采纳):主题帮助并入「强调」而非「动效」(同属 theme.addon 域);模糊/透明度保留 `wallpaperAdjustable` 守卫(行为零变化);组 description 保留(不删用户文案)
- 遗留:动效组 3 个 Beta chip 系 HEAD 死代码(挂在不存在的 #suffix 插槽)已删,若要真打 Beta 标需改挂 #tags(新增可见 UI,待用户定夺);`themeStyle.themeHelp` 行 emit click 无人监听(既有空壳交互);loading Teleport 仍用 --tx token + 裸 rgba(未触碰区);light/dark 走查归 Step 6

## Step 3 · SettingSection 迁移与删除 — ✅ 完成(2026-08-06)

- [x] SkillsMcp:4 Section→TuffGroupBlock,11 个显式 SettingDivider 全删(发丝线改容器注入);PluginsPage:2 卡 + 1 divider 删
- [x] OverviewPage:两层 bare 包装**整体删除**而非替换——SettingUser/SettingLanguage 自带组卡,再包会双标题(settingsOverview.account/general 键闲置未删)
- [x] IdentityCard 检查后无需改:已全量 --shell-* token(唯一裸值 12.5px tagline 与画板一致且 token 阶梯无位)
- [x] SettingSection.vue 删除:grep 零引用(SettingRow 内过期注释顺带订正),components.d.ts 两行生成声明移除
- [x] SettingsPage 列容器 `> :deep(.TGroupBlock-Container) { margin-bottom: 0 }`;**SettingSkeleton 同样加了该规则**(其组块是列的孙节点,不中和会比真实内容多 ~11px/组,破坏骨架同位契约)

## Step 4 · 手写卡片清理 P1/P2 — ✅ 完成(2026-08-06)

- [x] AppIndexManager:裸 section/手写头/摘要卡/过滤面板/条目卡 → 2 个 TuffGroupBlock(动作进 #header-extra,条目为卡直接子行);硬编码色 6 个 + 全部 rgba 清零;TModal 宿主的滚动链保持(overflow 经复合选择器压特异性推到卡体)
- [x] AppDiagnostic:结果/阶段/详情卡行化,阶段状态改 SettingChip 三语气(neutral/success/danger)
- [x] PlatformCapabilities:每 scope 一张外置标签卡;根保单根 div(StoreDocs class 透传);删 v1 遗留 `overflow: visible !important`;`.PlatformCapabilities-Toolbar` 双线回归修复
- [x] SettingUpdate:审计误判——`.lifecycle-panel` 是 flex 布局包装非描边面板,无可溶解;实际修复 = `.native-trust-alert` border-bottom 与注入发丝线叠加的双线(Step 1 引入的视觉回归)+ token 对齐,alert 形态保留
- [x] 验证:typecheck:web 0 错(vue-tsc 复跑确认);vitest settings 20 文件 118 例全绿;eslint 11 文件 0 错(prettier 3 警告逐条手改)
- **待定 token 决策**:shell 调色板无 success/warning/info(仅 danger),三组颜色语义被压平为中性 chip(条目 system/managed、来源 scanned/manual、空态 attention/filtered),文案仍承载语义;补 token 后可恢复,建议独立小任务
- 备忘:SettingDivider 现零消费者,按 design §1.3 作为行级原语保留;E/F 两组件虽在对话框内但系审计 P1 点名对象,已做,可独立 revert

## Step 5 · 智能并入设置 — ✅ 完成(2026-08-06)

- [x] 七条平级路由删除;子页经 `categories.ts` `children` 表注册为兄弟路由(分类页无 router-view,子页整页替换;`ShellNavItem` path 前缀选中天然生效);重定向由 children 表生成
- [x] 枢纽页:SettingSection 交叉链接块 → TuffGroupBlock「智能中心」+ 六 `SettingRow`,行数据读 `settingCategoryChildren('intelligence')` 不硬编码
- [x] 六子页换壳 `SettingsPage`(新增可选 `backTo`/`backLabel`/`fill` prop;LayoutBackButton 已不存在);`IntelligencePage.vue` 删除
- [x] 改指 8 处链接 + HomePage:572;**CoreBox action 发射点故意保持 `/intelligence/channels`**(插件白名单契约,见 design §4.2);`useActionPanel.test.ts` 断言保持原值+注释
- [x] i18n `settingsIntelligenceHub` 14 键定点插入(zh/en 各 +16 行,纯新增);`categories.smoke.test.ts` +3 例守子页表
- [x] typecheck:web 0 错;useActionPanel 10/10、smoke 8/8、settings 全量 22 文件 136 用例全绿;包内 eslint 0 错
- 附带修正:`SettingRow.vue:55,64` `background:` 简写 → `background-color`(否则抹掉 TuffGroupBlock 注入的发丝线)
- **交接 Step 3**:迁 SettingPluginsPage / SettingOverviewPage 时必须删掉显式 `SettingDivider`,否则与容器注入的发丝线成双线
- 遗留(完成报告列出):六个 landing 分区组件成孤儿(IntelligenceHeader/Channels/Capabilities/Prompts/LocalSkills/Future,归 settings-rewrite 清理);Workflow 子页 940 列内偏挤(固定 320+360 双栏,中栏 ≈228px,Step 6 走查定夺);`settingsEntries.intelligenceDesc` 键闲置未删

## Step 7 · 样式方向回退(2026-08-06 晚,用户终局拍板「都要改成 2,不是设计稿这种」)— ✅ 完成

- [x] `TuffGroupBlock.vue` / `TuffBlockSlot.vue` / `TuffBlockLine.vue` / `TuffBlockSwitch.vue` 按文件从 `2e8339013^` 恢复经典版本(`git show` 重定向,未用 checkout/stash;四文件历史确认无并发提交夹层)
- [x] 经典组件最小扩展:`name` 改为可选(默认 `''`),无 `name` 时不渲染 56px 组头(纯净卡片形态)——供迁移期新增的 5 处无标签卡(PluginsPage/AppDiagnostic ×2/AppIndexManager/PlatformCapabilities)与 SettingSkeleton 的可空标签使用
- [x] 移除 `SettingsPage.vue` 与 `SettingSkeleton.vue` 的 margin 中和规则(画板 20px 节奏随版式一并废弃,恢复经典自带间距;骨架建构在 TuffGroupBlock 上,自动镜像经典观感)
- [x] 保留:统一 TuffGroupBlock(SettingSection 删除不回退)、智能并入设置、外观页内容重组、SettingRow `background-color` 修正、i18n 文案对齐
- [x] 随经典恢复而复活:组/行图标、折叠+展开记忆(含 4 处默认折叠点恢复折叠)、`toggle` 事件
- [x] 验证:vue-tsc 0 错;vitest 30 文件 160 用例全绿;包内 eslint 0 错(1 条 prettier 空行手工修复)

## Step 8 · 遗留决策落地(2026-08-06 用户令:「2+3 参考最佳实践优化」)— ✅ 完成

- [x] **shell 语义色 token**:三色相 ×(基色/`-soft`/`-border`)写入四个块。高对比两块经核查 tuffex `variables.scss` 两个 mixin,success/warning/danger/info **基色与 `-light-9` 全部存在,无缺失、无兜底**;border 一律重指向实色(沿用 danger 那条「24% alpha 发丝线在高对比下消失」的理由,已在注释里点明其余三个同理)。深色对比的 `-light-9` 是 mix black,方向正好是 soft 面所需,已注释
- [x] **浅色 success/warning 偏离画板(唯一偏离)**:实测 11px chip 墨色落在自身 `-soft` 底上,画板 `#2C8C5A`=3.82:1、`#B57A18`=3.35:1,双双低于 AA 4.5:1;而现网 `--shell-danger` `#C4342B` 是 4.81:1 —— **继续用画板值才是那个不一致的选项**。故压深到 danger 同亮度:`#26794E`(4.80:1)、`#946210`(4.73:1),同色相深一档。info `#6E6E73` 原样过线(4.61:1),深色三色全部原样(最低 4.54:1)。未拆「文字专用」第二墨色:拆了每个消费方都得自己选,迟早选错。数字与理由已入文件注释,格式跟随既有 `--shell-on-primary` 先例
- [x] **恢复被压平的语义色**:`app-index-manager-display.ts` **未改也无需改** —— Step 4 压平的是组件里 `chipTone()` 塌到三档那一步,helper 语汇一直是全的,故其 9 个测试用例原样通过。来源 system→info / managed→neutral、origin manual→info / scanned→neutral(一条规则:只给「非默认的那一个」上色);诊断 needs-attention→warning、found→success;摘要计数 attention→warning、found→success(**查史证实改造前本就是 `#ff9500` 橙 + `#34c759` 绿,红色是 Step 4 的替代品,改回是还原**);空态 attention→success-soft 整行淡底、filtered→info-soft(原为描边小方块,行已无框故改 strip 语汇,正文实测 4.6:1)。SettingChip tone 扩为 5 档、TuffStatusBadge 全量迁 shell token,既有调用点零影响
- [x] **Workflow 子页**:style 块内 `rgba()`/裸 hex/深色渐变全清零(grep 验证);三栏→**作者自己那条 `@media 1440` 的排布转正**(它量视口,页面搬进设置列后永不触发):`minmax(200px,.9fr) minmax(320px,2.1fr)` + 具名 area,runtime 跨列到下一行,`.workflow-grid` 两栏→单栏。headless Chrome 复现 940 列(内容 860px)实测:**中栏 148→591px、编辑面板 66→591px**;两栏布局精确撑到 536px 列宽,而保留的 `@media 980` 单栏兜底在列宽仍有 ~640px 时即触发,两者无空档
- [x] 验证:vue-tsc 0 错;vitest 22 文件 128 用例全绿(含另一路 lang 套件,交叉验证两股改动可共存);包内 eslint 5 个 .vue 0 findings。**未改任何测试断言**(helper 语汇未变,阶段 tone 函数是组件内私有,测试够不到)
- [x] **i18n 修复(根因是错命名空间,非缺文案)**:9 个「缺失键」中 8 个在 `settings.intelligence.*` 下**本就中英齐全**,是 `IntelligencePromptSelector.vue` 误写为 `intelligence.*`(同文件混用两个命名空间)。子代理受「不动 .vue」约束先加了别名;主会话查明根因后**改组件 path 为 `settings.intelligence.*` 并删除全部别名**,消除同一文案两处漂移。真正新增的只有 `intelligence.search.clear`(en 取 `TuffAsideSearchBar` prop 默认值,zh 对齐兄弟键语域)
- [x] **单语键**:4 个 zh-only(`settings.intelligence.{userMessage,promptVariables}{Label,Placeholder}`)补 en——同样是既有字符串挂错父节点(`settings.settingAISDK.*`),照抄到正确节点;12 个 en-only 全路径 grep 确认零引用(排除 Nexus catalog 与 JS 变量名假阳性),按纪律**只报不删**
- [x] **顺带修无障碍误标**:`IntelligenceCapabilitiesPage:385` 与 `IntelligencePromptsPage:493` 把 `common.close` 当 clear-label,读屏播报「关闭」而非「清除搜索」;三个智能页搜索栏现统一用 `intelligence.search.clear`
- [x] 验证:两 catalog parse OK、重复键 0、别名 0 残留;vue-tsc 0 错;intelligence+lang 5 文件 42 用例绿;包内 eslint 0 错(1 条因 key path 变长触发的 prettier 折行手工修复)
- [x] **动效组 Beta 标**:维持移除(HEAD 起即死代码,恢复=新增视觉噪音,违背「不新增可见 UI」;如未来确需标注,挂 `#tags` 并按中性 chip 约定)
- [x] **诊断阶段 miss 红→琥珀:主会话裁决采纳**(2026-08-06)。代理如实指出本轮简报在这一项上前提有偏差(miss 改造前本就是红 `#ff3b30`,并非被压平),但其改动仍是对的:这些阶段是召回探针,「several of them always miss」是正常路径,总体成败由上方 Found chip 单独承担;用错误色表达预期状态会造成告警疲劳,训练用户忽略红色。判据已写入 `getAppDiagnosticStageTone` 上方注释
- 偏离:Workflow 页删了 `min-height: calc(100vh - 120px)`(runtime 独占一行后会把两行都撑成半空卡片)与 `0 18px 40px` 重投影(深色应用的浮起感,放进浅色列过重);原生控件补 `font-family: inherit`(否则掉回系统 UI 字体,深底上不明显、白卡上很明显)
- 未做(不属本轮):Workflow 页 `input { width: 100% }` 连 checkbox 一并拉宽 —— 既有问题非本轮回归,未动;`IntelligenceLocalSkills.vue:735` 仍留一个 `--tx-color-warning`,属 Step 5 已登记的智能落地页孤儿组件,归 settings-rewrite 清理
- 边界:若用户把侧栏拖得极宽,设置列可能跌破 536px 而 `@media 980` 尚未触发 → 该场景横向溢出。改前更差(旧布局需 712px+),属严格改善,记录备查

## Step 6 · 收口 — ✅ 完成(2026-08-06)

- [x] **lint delta = 0**:本任务改动且仍存活的 42 个 `.vue`/`.ts` 逐个跑包内 eslint,**零输出**(0 错 0 警)。全仓 `pnpm lint` 的 63 条 warning 全在 7 个 `src/main/` 文件、blame 归属其他提交,本轮为纯 renderer 改动,delta 判定为 0(依既定纪律判 delta 不判零、不整文件 `--fix`)
- [x] **`npm run typecheck` 双腿 exit 0**(node + web,合并所有并发改动后复跑)
- [x] **测试** 34 文件 199 用例全绿(settings / components·settings / intelligence ×2 / modules·settings / lang / styles / useActionPanel)
- [x] **实机走查**:dev 实例 HMR 后经 orca computer 截图核验 —— 经典卡内组头(标题+描述+折叠箭头)已回归;语义色生效(文件索引「正常」绿 chip、「已跳过 2607」琥珀);外观页结构 = 窗口效果三瓦片 / CoreBox 行(Beta 中性 chip + 编辑按钮)/ 个性化四行(色彩风格·主页壁纸·窗口模糊 20px·窗口透明度 100%,含画板描述文案)
- [x] **深色可信度以证据替代目检**(自定义 TxSelect 弹层不入无障碍树,合成点击无法切主题):① 本任务 38 个 `.vue` 全量扫描**零 hex / 零 rgba**,颜色全部经 token;② `.dark` 块三色相九值已核对写入;③ 深色墨色实测最低 4.54:1 全部过 AA;④ 深浅仅换 CSS 变量、DOM 与几何同构,故布局溢出不可能只在深色出现。**剩余风险仅为主观观感,建议用户在设置·外观切「深色」扫一眼**
- [x] 更新 `08-04-settings-rewrite` 范围注记(智能 + 文件索引由本任务接手、TuffGroupBlock 终局口径、死件清单移交)
- [x] spec 更新:`plugin-runtime-security.md` §8 固定 widget 路径为逐字节校验契约;`component-guidelines.md` 新增「Shell colour tokens」(四色相形状、对比块重指向、**chip 墨色对自身 soft 底测 AA**、颜色不作状态唯一载体、预期结果不用错误色)
