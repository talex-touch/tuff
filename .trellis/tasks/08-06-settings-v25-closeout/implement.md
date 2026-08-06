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

## Step 4 · 手写卡片清理 P1/P2

- [ ] `SettingFileIndexAppIndexManager.vue`(`:566-736`):手写头/摘要卡/过滤条/条目卡 → TuffGroupBlock + 行式
- [ ] `SettingFileIndexAppDiagnostic.vue`(`:545-692`):结果/阶段卡 → 行式
- [ ] `SettingPlatformCapabilities.vue`(`:197-241,370`):卡内二级手写组收敛
- [ ] `SettingUpdate.vue` `.lifecycle-panel`(`:776,1028`)收敛为行式/子分区
- [ ] 不动:对话框内部(SettingEverything §A、SettingFileIndex §B)、CanvasGridEditor、死件(AppSettings/SettingHeader/SettingMessages/SettingPermission/SettingWindow/SettingSentry)、死面 ThemePreference —— 完成报告列出

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

## Step 6 · 收口

- [ ] `pnpm lint`(注意 CoreApp 包内配置与根配置尾逗号规则相反,判 delta 不判零、不整文件 --fix)
- [ ] `apps/core-app` `npm run typecheck`
- [ ] light/dark 全设置域走查;验收清单(prd.md)逐项核对
- [ ] 更新 `08-04-settings-rewrite` 范围注记(智能分类由本任务接手);spec 更新(3.3)、提交(3.4)
