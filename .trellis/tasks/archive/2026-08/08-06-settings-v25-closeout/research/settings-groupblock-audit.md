# 审计:设置域分组组件使用 / 外观页结构 / 智能路由接线

来源:Explore 子代理审计(2026-08-06)。行号为审计时点快照,实施时以现场为准。

## 1. TuffGroupBlock 组件

定义:`apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue`

- Props(`:8-27`):`name`(必填)、`description`、`defaultIcon`、`activeIcon`、`iconSize`=22、`collapsible`=true、`collapsed`=false、`defaultExpand`=true、`memoryName`(经 `useUiPreference` 持久化展开态,key `tuff-block-storage-<memoryName>`)
- Emits:`toggle(expanded)`(`:29-31`);Slots:默认、`#icon="{ active }"`、`#header-extra="{ active }"`(`:178-194`)
- 旧视觉契约(`:305-318`、`:200-270`):`border: 1px solid var(--tx-border-color-lighter)`、12px 圆角、56px fake-background 组头(标题+描述+chevron)、GSAP 高度折叠

**两套体系并存**:v2 原语在 `components/settings/` —— `SettingSection.vue`(描边卡,`variant: card|bare`,`label`)、`SettingRow.vue`、`SettingDivider.vue`、`SettingChip.vue`、`SettingButton.vue`、`SettingSkeleton.vue`、`SettingsPage.vue`。`SettingSection.vue:45-56` 用 `--shell-border`/`--shell-radius-lg` 实现同类发丝线卡片。

## 2. 逐文件表

### views/base/settings/(根)

| 文件 | TuffGroupBlock | 手写分组标记 |
|---|---|---|
| AppSettings.vue | 否 | 有(`:57-67` `.AppSettings-Section`;样式 `:117-127`)。**死代码**:仅 AppSettings.layout.test.ts 引用,无路由入口 |
| SettingAbout.vue | 是(`:263`) | 无(内部 tag/Usage 胶囊而已) |
| SettingAssistant.vue | 是(`:147`) | 无 |
| SettingDownload.vue | 是(`:227`) | 无 |
| SettingEverything.vue | 是 ×3(`:609,953,1120`) | **重**,见 §A |
| SettingFileIndex.vue | 是 ×4(`:1107,1260,1664,1830`) | **重**,见 §B |
| SettingFileIndexAppDiagnostic.vue | **否** | 有:`:545-551` `.app-diagnostic-result`、`:629-638` `.app-diagnostic-stage`、`:686-692` `-stage-detail` |
| SettingFileIndexAppIndexManager.vue | **否** | **最重叶子**:`:566` 根、`:575-589` 手写 h4+p 头、`:644-654` 摘要卡、`:680-685` 过滤条、`:689/377/389` filter-group、`:731-736` `.app-index-entry` 卡、`:611-618` 空态卡 |
| SettingHeader.vue | 否 | 有(`:266,282-284`)。仅被死件 AppSettings 挂载 → 实质死件 |
| SettingIdentityCard.vue | 否 | 有(`:41`;样式 `:59-64` border+radius = group-block 克隆)。**总览页在用**;设计上身份带本就是独立卡 → 保留手写,仅 token 对齐 |
| SettingLanguage.vue | 是(`:14`) | 无 |
| SettingMessages.vue | 是(`:119`) | 无。**孤儿**(无挂载) |
| SettingNetwork.vue | 是 ×2(`:132,175`) | 无 |
| SettingPermission.vue | 是 ×2(`:436,603`) | 轻微(`:563`)。**孤儿** |
| SettingPlatformCapabilities.vue | 是(`:151`) | 有:`:197-198,237-241` `.PlatformCapabilities-Group(+Header/Count)` 嵌在块内;样式 `:370`。仅被 `store/StoreDocs.vue:32` 挂载 |
| SettingSentry.vue | 是(`:167`) | 无。**孤儿** |
| SettingSetup.vue | 是 ×2(`:604,746`) | 无 |
| SettingSkillsMcp.vue | **否** | **v2 体系**:SettingSection ×4(`:470,480,546,592`)+ SettingSkeleton `:468`;自有样式 `:809-851` |
| SettingTools.vue | 是 ×2(`:785,799`) | 无 |
| SettingUpdate.vue | 是(`:683`) | 中:`:776` `.lifecycle-panel`(样式 `:1028`)、`.native-trust-alert`,均嵌在块内 |
| SettingUser.vue | 是(`:211`) | 兄弟 `CreditsSummaryBlock`(`:295`)自身用 TuffGroupBlock |
| SettingWindow.vue | 是(`:133`) | 无。**孤儿** |

### categories/(11 个分类壳)

- SettingOverviewPage.vue:SettingSection variant="bare" ×2(`:20,24`)+ SettingIdentityCard(`:18`)
- SettingIntelligencePage.vue:SettingSection+SettingRow(`:24-31`),与 TuffGroupBlock 系的 SettingAssistant(`:16-18`)同屏 —— **全应用最刺眼的混搭**
- SettingPluginsPage.vue:SettingSection/Row/Divider(`:33-57`)+ 自定义 `.SettingPluginsPage-Tree`(`:54,62-64`)
- 其余 8 个(About/Appearance/Download/FileIndex/General/Network/Storage/Update)纯透传,无问题

### components/(对话框,均非分组场景,不动)

FailedFilesListDialog(`:255-257`)、RebuildConfirmDialog(`:153`)、ShortcutDialog(`:72`)、ShortcutDialogRow(`:251-252`)

### views/base/styles/

| 文件 | TuffGroupBlock | 手写 |
|---|---|---|
| ThemeStyle.vue | 是 ×3(`:509,768,798`) | **有**:`.theme-style-wallpaper-panel` ×4(`:570,614,671,699`;样式 `:936-942`,`--tx-border-color`+8px 圆角,嵌在 12px 组内)+ `:888` loading 面板 |
| WindowSection.vue | 是(`:9`) | 无 —— 正确包装范式 |
| CoreBoxCanvasSection.vue | 是(`:29`) | 无 —— 最干净参考实现 |
| SectionItem.vue | 否 | 边缘:可选中瓦片(`:37-55`,radius `:121`),是「行」不是「组」,不动 |
| sub/ThemePreference.vue | **否** | **styles 最重**:`:91,113,114`;样式 `:230-234,346,353,376-384`。**不可达**:`base/style-routes.ts:23-36` 注册 `/styles/theme` 子路由但 ThemeStyle 无 `<router-view>` → 死面 |
| editors/CanvasGridEditor.vue | 否 | 有:`:222-268`;样式 `:444-455,378-380`(几何同 TuffGroupBlock) |
| editors/CoreBoxEditorOverlay.vue | 否 | 轻微(`:70`,无描边) |

### 外观页补充事实

- 页面链:`modules/settings/categories.ts:39-45` → `router.ts:78` → `SettingAppearancePage.vue:15-17`(`SettingsPage` + `ThemeStyle embedded`);`ThemeStyle.vue:53-54` embedded 时用普通 div(`:492`)替代 ViewTemplate
- 模板渲染序(`:490-895`):① 窗口效果 `:493-505`;② CoreBox `:507`;③ 个性化 `:509-766`(TuffBlockSelect 主题模式 `:517-535`、壁纸来源 `:537-563`、状态行 `:565`、手写面板 ×4、壁纸库开关 `:743-765`);④ 强调 `:768-795`(2 开关);⑤ 动画 `:798-872`(5 行);⑥ 游离 TuffBlockSwitch 主题帮助 `:874-883`(无组包裹);⑦ Teleport loading `:886-893`
- 旧顶层 `/styles` 路由仍在(`base/router.ts:228` → `createStylesRouteRecord`),非 embedded 挂同一 ThemeStyle → 同页双入口

## 3. 智能接线

### 路由(base/router.ts,七条平级,均 index:8 / keepAlive / 无 children)

| 路径 | 行 | 组件 |
|---|---|---|
| /intelligence | `:259-270` | IntelligencePage.vue |
| /intelligence/channels | `:271-282` | IntelligenceChannelsPage.vue |
| /intelligence/capabilities | `:283-294` | IntelligenceCapabilitiesPage.vue |
| /intelligence/prompts | `:295-306` | IntelligencePromptsPage.vue |
| /intelligence/audit | `:307-318` | IntelligenceAuditPage.vue |
| /intelligence/agents | `:319-330` | IntelligenceAgentsPage.vue |
| /intelligence/workflows | `:331-342` | IntelligenceWorkflowPage.vue |

路由名 i18n:`modules/lang/en-US.json:2294-2300` + zh-CN 镜像。

### 导航现状

- 主导航内联在 `components/shell/ShellSidebar.vue:122-129`(首页)/ `:94-106`(设置,驱动自 `groupedSettingCategories()`);`:55` `isSettingsContext = path.startsWith('/setting')` → 现状 /intelligence/* 显示的是**首页**侧栏(正是要修的接缝)
- **首页侧栏已移除智能入口**(`:124-127` 注释:Intelligence moved under 「设置 · 智能」),仅剩 新建对话/市场/设置
- 设置分类注册 = 双清单契约:`modules/settings/categories.ts:24-102`(`SETTING_CATEGORIES`:key/path/icon/labelKey/group;`LEGACY_SECTION_REDIRECTS:109-112`)+ `router.ts:74-103`(`createSettingCategoryRoutes()`,**只产平级路由**,loaders `:75-87`,不变式注释 `:70-73`)
- `intelligence` 分类已存在:`categories.ts:46-52` → `SettingIntelligencePage.vue`(挂 SettingAssistant ×2 + SettingSkillsMcp,`:29` 跳 `/intelligence`)

### 指向 /intelligence* 的链接(全部需改指)

1. `categories/SettingIntelligencePage.vue:29` → /intelligence
2. `SettingSkillsMcp.vue:454` → /intelligence
3. `components/intelligence/IntelligenceChannels.vue:22` → /intelligence/channels
4. `components/intelligence/IntelligenceCapabilities.vue:26` → /intelligence/capabilities
5. `components/intelligence/IntelligencePrompts.vue:34,47` → /intelligence/prompts
6. `components/intelligence/IntelligenceFuture.vue:16,20` → /intelligence/agents, /intelligence/workflows
7. `components/intelligence/config/IntelligencePromptSelector.vue:94` → /intelligence/prompts
8. `components/intelligence/audit/IntelligenceAuditOverlay.vue:20` → /intelligence/audit
9. CoreBox action payload → /intelligence/channels;断言在 `modules/box/adapter/hooks/useActionPanel.test.ts:180,187`

### 页面壳(迁移的真正阻力)

- IntelligencePage.vue:ViewTemplate(`:27,72`)+ 手写 `.intelligence-stats` 条(`:31-59`)+ `.intelligence-grid`(`:62-65`)——不适配 940px 列
- IntelligenceAgentsPage.vue `:67` / IntelligenceWorkflowPage.vue `:372`:ViewTemplate
- IntelligenceCapabilitiesPage.vue `:373`:TuffAsideTemplate(master/detail)——最难塞进 940px 列
- IntelligenceChannelsPage.vue `:339` / IntelligenceAuditPage.vue `:38` / IntelligencePromptsPage.vue `:476`:裸 div + 自带头部
