# 执行计划 · ③ 外观分类

设计：`design.md` 第 1 节。本轮只做外观，其余 8 个分类不动。

顺序原则：**先抽逻辑（不改表现）→ 再逐组换表现层 → 全部通过后才删旧组件。** 每个检查点都能独立回滚。

## 阶段 0 · 基线

- [ ] 记录改动前 `apps/core-app` 的 `npm run typecheck` 与 `pnpm lint` 状态（区分既有红与本轮引入）
- [ ] 按 `design.md` 1.5 的 25 行建立核对清单，逐项记录改前的实际读写行为（不是读代码猜，是在应用里改一次值）

## 阶段 1 · 抽壁纸逻辑（无视觉变化）

- [ ] 新建 `appearance/use-appearance-wallpaper.ts`，把 `ThemeStyle.vue` 的 `ensureBackground` / `bgSourceValue` / `bg*` computed / `selectBackgroundImage*` / `selectBackgroundFolder*` / `refreshDesktopWallpaper*` / `copyWallpaperToLibrary` / `syncWallpaperLibrary` / `rollbackWallpaperSource` / `ensureWallpaperSourceReady` 原样搬入
- [ ] `ThemeStyle.vue` 改为消费该 composable，**模板一行不动**
- [ ] 关卡：`npm run typecheck`；应用里手测壁纸来源切到 自定义 / 文件夹 / 桌面 各一次，行为与阶段 0 记录一致

## 阶段 2 · 新增基础件

- [ ] `components/settings/SettingRowSlider.vue`：track 定宽 160、数值列右对齐定宽，接 `TxSlider`
- [ ] `components/settings/SettingNotice.vue`：组内提示条（`design.md` 1.5 第 5 项）
- [ ] 两者补单测（宽度契约 + 数值格式化 + 禁用态）
- [ ] 关卡：`npx vitest run` 相关用例 + typecheck

## 阶段 3 · 逐组换表现层

每一组完成后单独跑关卡，不一次性推平。

- [ ] **3.1 窗口效果**：`appearance/AppearanceWindowEffect.vue` 吸收 `WindowSection` + `SectionItem`；三块 `fill_container` 等分、选中态 2px `$primary` 描边 + 实心 radio
- [ ] **3.2 CoreBox**：`appearance/AppearanceCoreBoxRow.vue`，单行 + Beta chip + `编辑` 次级按钮，继续引用 `editors/CoreBoxEditorOverlay.vue`；消掉现在标题重复两遍的问题
- [ ] **3.3 个性化**：`appearance/AppearanceWallpaper.vue`，含 1.5 的 3/4/5/6/7/8/9/10/11/12/16 与 1.6 的全部 gating
- [ ] **3.4 壁纸滤镜**：`appearance/AppearanceFilters.vue`，13/14/15
- [ ] **3.5 强调 + 动画**：直接写在页面里，17–23
- [ ] **3.6 页面组装**：`SettingAppearancePage.vue` 换成 `SettingsPage` + 6 个 `SettingSection`；搬运 25（loading 遮罩）；删掉那句关于 `/styles/theme` 子路由的失效注释
- [ ] 每组关卡：`npm run typecheck` + 该组涉及设置项在应用里改一次值并确认落盘

## 阶段 4 · 文案

- [ ] 新增行的 title/desc 补 `en-US.json` / `zh-CN.json`，两边键集合相等
- [ ] 关卡：无 `t()` 回落到 key 字面量

## 阶段 5 · 清理

**前置：1.5 的 25 项全部打勾。**

- [ ] `grep -rn` 确认 `ThemeStyle.vue` / `WindowSection.vue` / `SectionItem.vue` / `CoreBoxCanvasSection.vue` 引用归零后删除
- [ ] `SectionItem.semantic.test.ts` / `wallpaper-display-state*.ts` 等既有测试迁移到新落点，不是删除
- [ ] 确认 `editors/` 未被误删

## 验收（本轮口径）

- [ ] `design.md` 1.5 的 25 项逐行核对通过，无遗漏、无只读化
- [ ] 1.6 的条件渲染行为与改前一致
- [ ] 外观页内不再出现折叠分组卡片与逐行图标
- [ ] 强调色只出现在：主按钮、开关开态、进度条、选中态
- [ ] light / dark 双主题无对比度不足或布局溢出
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过
- [ ] `packages/tuffex` 测试全绿（本轮动过 `TxSlider`）

## 回滚点

| 回滚到 | 条件 |
|---|---|
| 阶段 1 之前 | composable 抽取导致壁纸行为漂移 |
| 阶段 3.x 之前 | 某一组表现层重写不达标，其余组已完成的可保留 |
| 阶段 5 之前 | 逐项核对发现漏搬 —— 旧组件此时仍在，可直接挂回 |
