# 技术设计 · 设置 v2.5 收口

> **⚠️ 终局口径(2026-08-06 晚,用户第二次拍板,推翻当天早间的第一次)**:TuffGroupBlock **保持经典卡内组头样式**(图标+标题+描述+折叠箭头+展开记忆),**不采用**画板 `E0C1Zz` 的外置标签版式——“都要改成 2,不是设计稿这种”。§1 记录的 v2 视觉契约已实现后按用户要求回退(见 implement.md Step 7);画板此后只作**页面内容/行结构**参考,不作组件 chrome 参考。保留的结构性成果:TuffGroupBlock 是设置域唯一分组原语(SettingSection 已删)、手写卡片全部换为 TuffGroupBlock(`name` 现为可选,缺省时渲染无头卡片)、智能并入设置、外观页内容重组。

## 0. 已决口径(用户 2026-08-06 早间拍板;样式方向后被顶部终局口径推翻)

1. **TuffGroupBlock 升级为画板版式,成为设置域唯一分组原语**:组标签外置、单层卡片、行间发丝线、无折叠头/无组图标。全部 ~20 个使用方一次性得到 v2 观感。**[样式部分已回退;“唯一分组原语”继续有效]**
2. SettingSection 的使用方迁回 TuffGroupBlock;SettingSection 组件随后删除(SettingsPage / SettingRow / SettingDivider / SettingChip / SettingButton / SettingSkeleton 保留,见 §1.3)。
3. 智能整体并入设置(独立入口不保留,旧路由重定向)。

审计依据:`research/settings-groupblock-audit.md`(两套体系并存、逐文件手写卡片清单、智能路由接线)。

## 1. TuffGroupBlock v2 升级

文件:`apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue`

### 1.1 新视觉契约(对齐画板 `E0C1Zz` / 父任务 design.md §4.2)

- 组标签外置:`name` 渲染为卡片上方小号灰字(**12px / letterSpacing 0.2 / `var(--shell-text-muted)`** —— 画板 `iqbKR` SecLabel 实测 `fs-sm`;父任务 design.md §4.2 写的 11px 是侧栏导航组标签,系混写,已订正),`description` 若有,渲染为标签行下 11px muted 文本(同在卡外)。
- 卡片:`var(--shell-bg)` 填充 + 1px `var(--shell-border)` 描边 + `var(--shell-radius-lg)` 圆角,`overflow: hidden`(TxSelect 下拉经 Teleport 到 body,不受裁剪),内部零 padding(行自带 [12,16])。
- 行间分隔:发丝线 1px `var(--shell-border)`,**左缩进 16、右侧齐边**(画板 DividerWrap padding `[0,0,0,16]` 的非对称读法,与 `SettingDivider.vue` 既有实现一致;初稿「左右各 16」有误,已订正)—— 由卡片容器以 `background-image` 对直接子行统一注入(border 无法缩进、`::before` 被 fake-background 占用);**子行 hover 背景必须用 `background-color` 而非 `background` 简写**,否则盖掉分隔线。
- 组间距:组件遗留的 `margin-bottom: 0.7rem` 保留(约 39 个使用方的父容器无 gap,依赖它撑开);设置壳内 `SettingsPage-Column` 的 `gap: 20` 与之叠加 ≈31px,偏离画板节奏 —— **Step 3 在 SettingsPage 列容器以 deep 规则中和直接子块的 margin,设置域恢复 20;非设置上下文维持现状**(2026-08-06 裁决)。
- 与 SettingSection 现实现(`components/settings/SettingSection.vue`)的 card variant 数值对齐;不再使用 `--tx-border-color-lighter` / 12px 圆角 / 56px fake-background 组头。

### 1.2 API 兼容策略(20 个使用方不破坏)

| 现有 prop/slot | 处置 |
|---|---|
| `name` / `description` | 保留,渲染位置移到卡外 |
| `defaultIcon` / `activeIcon` / `iconSize` / `#icon` | **no-op**(v2 版式无组图标),prop 保留不报错 |
| `collapsible` / `collapsed` / `defaultExpand` / `memoryName` / `toggle` 事件 | **no-op,恒展开**;GSAP 折叠动画与 `useUiPreference` 记忆逻辑删除 |
| `#header-extra` | 保留,渲染在外置标签行的右端(现有用法多为计数/操作按钮,不能丢) |
| 默认插槽 | 卡片主体 |

爆炸半径:TuffGroupBlock 在设置域之外也有使用(`store/StoreCliBeta.vue`、`components/intelligence/*`、`CreditsSummaryBlock` 等)——一并获得 v2 观感,可接受(智能本轮并入设置;商店页观感统一是正向)。升级前 grep `collapsible` 显式传参的使用方,确认没有依赖折叠交互隐藏超长内容的场景;若有,该处内容改为默认展示或页面内自行分段。

### 1.3 SettingSection 系的归宿

- `SettingSection` 使用方(SettingSkillsMcp、SettingOverviewPage、SettingIntelligencePage、SettingPluginsPage)模板换为 TuffGroupBlock(`variant="bare"` 的两处 → 不套卡片的场景,改为直接内容或 TuffGroupBlock 无标签形态,按现场判断)。迁完删除 `SettingSection.vue`。
- `SettingRow` / `SettingDivider` / `SettingChip` / `SettingButton` **保留**:它们是行级原语,与 TuffGroupBlock(组级)正交;TuffBlock* 行族与 SettingRow 并存,本轮不合并行族,但两者都必须符合画板行式(见 §1.4)。
- `SettingsPage`(页面壳:标题 + 940px 内容列 + 渐隐滚动)保留,是设置分类页的统一壳。
- `SettingSkeleton` 保留并**同步改版**:骨架必须镜像新版式(外置标签条 + 单层卡片行),不能再画旧的卡内组头。

### 1.4 行式对齐

TuffBlock* 行族(TuffBlockSelect / TuffBlockSwitch / TuffBlockSlot 等)对齐 C2/Row:`padding [12,16]`、左侧 title 13.5 `--shell-text-primary` + desc 12 `--shell-text-secondary` lineHeight 1.5、右侧 trailing gap 6;行级 icon **props** no-op,但**行级 `#icon` 插槽保留渲染**(内容型用例:`SettingUser.vue:226` 以该插槽放用户头像,`user-identity-presentation.test.ts:286` 断言其存在;组级 `#icon` 才是完全不渲染)。滑条行 = 滑条 + 右侧数值文本(画板「窗口模糊 0px / 窗口透明度 100%」)—— `components/tuff/` 下无滑条行组件,由 Step 2 在 ThemeStyle 现场以 TuffBlockSlot 拼装。

遗留(不在本轮):`TuffStatusBadge` 仍用 `--tx-color-success/warning/error` —— shell token 无 success/warning/info 位,硬转需新造 token,列入完成报告;`components/base/group|select|switch/` 下另有一套同名旧组件(TGroupBlock/TBlockSlot 等),无人挂设置域,不动。

## 2. 外观页对齐 E0C1Zz

页面链:`/setting/appearance` → `SettingAppearancePage` → `ThemeStyle(embedded)`。分区目标(画板顺序):

| 画板组 | 现状 | 改动 |
|---|---|---|
| 窗口效果 | `WindowSection` → TuffGroupBlock + 3 列 `SectionItem` | 结构保留;TuffGroupBlock 升级后自动对齐;`SectionItem` 瓦片对齐画板:大预览图(选中带主色描边)+ 下方 radio 标签行 |
| CoreBox | `CoreBoxCanvasSection` → TuffGroupBlock + TuffBlockSlot + 编辑 overlay | 结构保留;行内容对齐画板:「自定义 CoreBox」+ Beta chip + 描述 + 右侧「编辑」描边按钮 |
| 个性化 | TuffGroupBlock 内 2 个 TuffBlockSelect + **4 个手写 `.theme-style-wallpaper-panel`(8px 圆角嵌套面板,主要偏差源)** | 面板全部溶解为发丝线行。画板 4 行(色彩风格 / 主页壁纸 / 窗口模糊 / 窗口透明度)置于「个性化」组;其余壁纸细项(自定义壁纸路径、文件夹、桌面同步、调节滑条、壁纸库开关)按同一行式收进「壁纸」组 |
| (画板未画,口径保留) | 强调组(2 开关)、动画组(5 行)已是 TuffGroupBlock | 升级后自动对齐;页底游离的主题帮助 `TuffBlockSwitch`(`:874-883`)收进相邻组,不留无组行 |

约束重申:外观 25 项全保留,不裁撤;`styles/sub/ThemePreference.vue` 是死路由页面(`/styles/theme` 无 router-view 渲染),**不投入改造**,在完成报告中列为遗留项。

## 3. 手写卡片清理(设置域)

按审计优先级,本轮范围:

- **P0**:`SettingOverviewPage` / `SettingPluginsPage` / `SettingIntelligencePage` / `SettingSkillsMcp` 的 SettingSection→TuffGroupBlock;`ThemeStyle` 壁纸面板(§2)。
- **P0 例外**:`SettingIdentityCard` 的手写卡**保留**——画板 `iqbKR` 的身份带本就是无外置标签的独立卡片,不是分组块;仅把颜色/圆角对齐 `--shell-*` token。
- **P1**:`SettingFileIndexAppIndexManager`(手写标题/摘要卡/过滤条/条目卡)、`SettingFileIndexAppDiagnostic`(结果/阶段卡)改为 TuffGroupBlock + 行式。
- **P2**:`SettingPlatformCapabilities` 卡内二级手写组、`SettingUpdate` `.lifecycle-panel` 收敛为行式或子分区。
- **不在本轮**(完成报告列出,不动):对话框内部卡片(`SettingEverything` §A、`SettingFileIndex` §B 的 dialog-section ×10)、编辑器面板(`CanvasGridEditor`)、死件(`AppSettings`/`SettingHeader`/`SettingMessages`/`SettingPermission`/`SettingWindow`/`SettingSentry` 无挂载点,清理归 `08-04-settings-rewrite`)。

## 4. 智能并入设置

### 4.1 信息架构

- 设置「智能」分类(已存在,`/setting/intelligence`)升级为**枢纽页**:上半部 = 现 SettingAssistant / SettingSkillsMcp 的配置内容;下半部 = 「智能中心」组,六个入口行(渠道 / 提示词 / Agents / 工作流 / 审计 / 能力),行式 = title + desc + chevron。
- 六个子页迁为设置子路由:`/setting/intelligence/{channels,prompts,agents,workflows,audit,capabilities}`。设置侧栏保持单级(画板即单级);「智能」分类项在子路径下保持选中态(path 前缀匹配)。
- 子页统一换壳为 `SettingsPage`(标题 + 940px 列),页顶加返回「智能」的返回行(复用 `LayoutBackButton` 既有能力)。`IntelligenceCapabilitiesPage` 的 master/detail(TuffAsideTemplate)保留其内部结构,约束在内容列宽内。
- `IntelligencePage.vue`(原独立首页)的统计条与两列宫格不再需要——枢纽页由 SettingIntelligencePage 承担,`IntelligencePage.vue` 退役(路由不再指向),文件随迁移删除或留待 rewrite 清理(倾向删除,避免死件累积)。

### 4.2 路由与重定向

- `base/router.ts:259-342` 七条平级路由删除;`createSettingCategoryRoutes()` 扩展为支持分类 children(仅智能用到),keepAliveKey 按子页区分。
- 旧深链重定向:`/intelligence` → `/setting/intelligence`;`/intelligence/:sub` → `/setting/intelligence/:sub`(workflows 命名差异注意:旧 `/intelligence/workflows`)。
- 链接改指(见审计;**CoreBox action 发射点除外**):SettingSkillsMcp、IntelligenceChannels/Capabilities/Prompts/Future/PromptSelector/AuditOverlay、SettingIntelligencePage、HomePage:572。
- **CoreBox action 的 `/intelligence/channels` 故意不改**(2026-08-06 实施中查明):它是 `plugin-business-capabilities.ts` `FIXED_WIDGET_NAVIGATION` 与插件侧 `touch-intelligence/index.js` 之间逐字节校验的白名单常量,宿主侧是校验而非覆写;单改宿主会拒掉插件 widget,双改会拒掉用户已安装的旧版插件(插件从 userData 加载,不随应用打包更新)。该路径长期保持原值,由 `/intelligence/*` 重定向承接;`useActionPanel.test.ts:180,187` 断言保持原值并加注释。若未来要迁,需「宿主+插件+4 个跨包测试+旧插件兼容策略」独立任务。
- i18n:`router.intelligence*` 键调整/新增设置域键,zh/en 双语同步。

### 4.3 行为保持

七个页面的业务逻辑、数据通路、SDK 调用零改动 —— 只换页面壳与路由注册。

## 5. 实施顺序与验证

1. TuffGroupBlock v2 升级(+SettingSkeleton 同步)→ typecheck + 双主题目检(全设置域观感一次切换,单独成提交,可独立 revert)
2. 外观页(§2)→ typecheck
3. SettingSection 迁移 + 删除(§3 P0)→ typecheck
4. 手写卡片 P1/P2 → typecheck
5. 智能并入(§4,路由/换壳/重定向/链接/i18n/测试)→ typecheck + `useActionPanel.test.ts`
6. 收口:`pnpm lint`、`apps/core-app` `npm run typecheck`、light/dark 走查、验收清单逐项核对

风险:TuffGroupBlock 升级是全局观感切换,若个别页面出现布局破损,该页在同一提交内跟进修复;升级提交与迁移提交分开,便于二分。
