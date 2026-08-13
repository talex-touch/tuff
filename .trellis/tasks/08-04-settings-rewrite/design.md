# 技术设计 · ③ Setting*.vue 按设计稿重写

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign/design.md`
前置：子任务 ②（`08-04-settings-ia-primitives`）已落地 `SettingsPage` / `SettingSection` / `SettingRow` / `SettingDivider` / `SettingChip` / `SettingButton` / `SettingProgress`。

**本轮范围：只做「外观」一个分类。** 其余 8 个分类留作后续迭代，本文件按分类分节增补。

---

## 1. 外观（`/setting/appearance`）

画板：`E0C1Zz`（Shell · 设置 · 外观 · 浅色 v2）。以下数值均为画板实测。

### 1.1 现状与差距

`SettingAppearancePage.vue` 目前只是全屏挂载 `views/base/styles/ThemeStyle.vue`，后者用的是 `TuffGroupBlock` 折叠卡片 + 逐行图标 + 内嵌 panel 的旧语言，与画板的「组标签外置 + 单层描边容器 + 行间发丝线」不是一套。

`SettingAppearancePage.vue` 里「`ThemeStyle` 有自己的标题、滚动容器和嵌套 `/styles/theme` 子路由」这句注释已失效 —— 路由表里不存在 `/styles/*`，CoreBox 画布编辑器是 `CoreBoxEditorOverlay` 覆盖层而非路由。重写时连同注释一并纠正。

### 1.2 目标结构

画板定义了前三组；后三组是画板未画、但按本轮决定**必须保留**的既有设置，沿用同一行式语言补齐。

| # | 组 | 来源 | 行 |
|---|---|---|---|
| 1 | 窗口效果 | 画板 | 3 张预览图块（Pure / Refraction / Filter） |
| 2 | CoreBox | 画板 | 自定义 CoreBox（Beta chip + `编辑` 次级按钮） |
| 3 | 个性化 | 画板 | 色彩风格 / 主页壁纸 / 窗口模糊 / 窗口透明度 + 壁纸来源的条件行 |
| 4 | 壁纸滤镜 | 补 | 亮度 / 对比度 / 饱和度 |
| 5 | 强调 | 补 | 上色 / 高对比度 |
| 6 | 动画 | 补 | 列表交错 / 结果过渡 / 路由过渡 / CoreBox 尺寸动画 / 低电量自动降级 |

末尾保留「主题帮助」引导行（非设置项，`guidance` 形态）。

### 1.3 画板实测

**Body**：`Sec` 之间 gap 20，内容宽 940（已由 `SettingsPage` 承担）。每个 `Sec` = `LabelWrap`（h17）+ gap 6 + `Card`。

**窗口效果 Card**：padding 16、gap 32、`$bg` + `radius-lg` + 1px `$border` 内描边。
单个选项 292×175 vertical gap 9：
- `Preview` 292×150、`radius-md`、`clip`；选中态为 2px `$primary` 描边
- `LabelRow` h16 gap 7：`Radio` 12×12 圆（选中 `$primary` 实心，未选 1px `$border` 空心）+ `Name` `fs-body`

三列等分用 `fill_container`，不硬编码 292。

**CoreBox / 个性化 Card**：行高 65（padding `[12,16]`），行间 `DividerWrap` 1px，Divider **左缩进 16、右侧齐边**（x=16 w=924 于 940）—— 这正是既有 `SettingDivider` 的实现。

**Row 内部**（`C2/Row`，已由 `SettingRow` 实现）：左 `TitleRow`（title 13.5 + 可选 Badge）+ desc `fs-sm` lineHeight 1.5、gap 3；右 `RowTrailing` 垂直居中。

**Trailing 三种形态实测**：
- 按钮：68×29，`$bg` 底 + 1px `$border`，icon 13 + 文字 —— 既有 `SettingButton` 的 `secondary`
- 选择器：96×30，padding 左 10，值文字 `fs-body` + chevron 13
- 滑块：总宽 218 = Track 160 + gap + 值文字 46，右对齐

### 1.4 Trailing 控件的落地

`SettingRow` 的 `trailing` 插槽直接放 tuffex 原子组件，不再包 `TuffBlock*`：

| 形态 | 组件 | 备注 |
|---|---|---|
| 选择器 | `TxSelect` + `TxSelectItem` | 现有 `TuffBlockSelect` 是「整块」，这里只要它内部的选择器 |
| 开关 | `TxSwitch` | 同上，替掉 `TuffBlockSwitch` |
| 滑块 | `TxSlider` + 值文字 | 定宽 160 的 `SettingRowSlider` 包一层，统一 track 宽度与数值列宽 |
| 按钮 | `SettingButton variant="secondary"` | 已有 |
| 标签 | `SettingChip` / `TxStatusBadge` | Beta 用既有 `TxStatusBadge` |

**滑块 track 宽度与画板的偏差**：画板 Bar 高 4px。`TxSlider` 本轮已在 tuffex 侧改为静止 6 / hover 8 / 拖拽 10，并把拖拽态提成 `is-dragging` 类（画板是静态图，画不出拖拽态）。这是刻意偏离，不回退到 4px；如需画板保真，`--tx-slider-track-height` 可在页面级覆盖。

### 1.5 逐项映射（验收依据）

`ThemeStyle.vue` 现有的每一项都必须在新页面里可读可写。

| # | 设置 | 现状载体 | 新载体 | 组 |
|---|---|---|---|---|
| 1 | 窗口偏好 pure/refraction/filter | `WindowSection` + 3×`SectionItem` | 新 `AppearanceWindowEffect` | 1 |
| 2 | 自定义 CoreBox → 编辑 | `CoreBoxCanvasSection` | `SettingRow` + `SettingButton` | 2 |
| 3 | 色彩风格 | `TuffBlockSelect` | `SettingRow` + `TxSelect` | 3 |
| 4 | 主页壁纸来源 | `TuffBlockSelect` | `SettingRow` + `TxSelect` | 3 |
| 5 | 壁纸来源提示 | `theme-style-wallpaper-status` | `SettingRow` 的 desc 或 `SettingNotice` | 3 |
| 6 | 自定义图片：选择 / 清除 / 预览 | `theme-style-wallpaper-panel` | 条件 `SettingRow`（value=路径，trailing=两个按钮）+ 预览行 | 3 |
| 7 | 文件夹：选择 / 清除 | 同上 | 条件 `SettingRow` | 3 |
| 8 | 文件夹轮换模式 随机/顺序 | `TxRadioGroup` | `SettingRow` + `TxSelect` | 3 |
| 9 | 文件夹轮换间隔 | `TxSlider` | `SettingRow` + 滑块 trailing | 3 |
| 10 | 桌面壁纸：刷新 | `theme-style-wallpaper-panel` | 条件 `SettingRow` + 按钮 | 3 |
| 11 | 窗口模糊 | `TxSlider` | `SettingRow` + 滑块 trailing | 3 |
| 12 | 窗口透明度 | `TxSlider` | 同上 | 3 |
| 13 | 亮度 | `TxSlider` | 同上 | 4 |
| 14 | 对比度 | `TxSlider` | 同上 | 4 |
| 15 | 饱和度 | `TxSlider` | 同上 | 4 |
| 16 | 复制到壁纸库 | `TuffBlockSwitch` + tooltip | `SettingRow` + `TxSwitch`，tooltip 降为 desc | 3 |
| 17 | 上色 | `TuffBlockSwitch` | `SettingRow` + `TxSwitch` | 5 |
| 18 | 高对比度 | `TuffBlockSwitch` | 同上 | 5 |
| 19 | 列表交错动画 (Beta) | `TuffBlockSwitch` + badge | 同上 + `TxStatusBadge` | 6 |
| 20 | 结果过渡动画 (Beta) | 同上 | 同上 | 6 |
| 21 | 路由过渡样式 | `TuffBlockSelect` | `SettingRow` + `TxSelect` | 6 |
| 22 | CoreBox 尺寸动画 (Beta) | 同上 | 同上 | 6 |
| 23 | 低电量自动降级 | `TuffBlockSwitch` | `SettingRow` + `TxSwitch` | 6 |
| 24 | 主题帮助 | `TuffBlockSwitch guidance` | 引导行，保持非设置语义 | 尾 |
| 25 | 窗口切换 loading 遮罩 | `Teleport` + 遮罩 | 原样搬运 | — |

### 1.6 条件渲染必须保持不变

- 6/7/10 分别由 `isCustomSource` / `isFolderSource` / `isDesktopSource` 控制
- 8/9 额外要求 `folderBgPath` 非空
- 11–15 由 `wallpaperAdjustable` 控制。**画板把「窗口模糊 / 窗口透明度」画成常驻行，实现保留现有 gating** —— ③ 的约束是「读写逻辑、校验、副作用保持不变」，放开 gating 会让未配置壁纸时出现无效滑块。
- 16 由 `wallpaperLibrarySupported` 控制

### 1.7 文件落位

```
views/base/settings/categories/
  SettingAppearancePage.vue          重写：组装 6 个 SettingSection
  appearance/
    AppearanceWindowEffect.vue       新：窗口效果三图块（吸收 WindowSection + SectionItem）
    AppearanceCoreBoxRow.vue         新：CoreBox 行 + 编辑器 overlay
    AppearanceWallpaper.vue          新：个性化组（含全部条件行）
    AppearanceFilters.vue            新：壁纸滤镜组
    use-appearance-wallpaper.ts      新：从 ThemeStyle.vue 抽出的壁纸读写逻辑（原样搬运）
components/settings/
  SettingRowSlider.vue               新：定宽 track + 数值列的 trailing 滑块
  SettingNotice.vue                  新：组内提示条（对应 5）
```

`views/base/styles/` 下 `ThemeStyle.vue` / `WindowSection.vue` / `SectionItem.vue` / `CoreBoxCanvasSection.vue` 在外观页切换完成、逐项核对通过后删除；`editors/`（CoreBox 画布编辑器）保留，被 `AppearanceCoreBoxRow` 继续引用。

### 1.8 风险

| 风险 | 应对 |
|---|---|
| 25 项里漏搬 | 1.5 的表逐行打勾，不抽样；每项在真实应用里改一次值并确认落盘 |
| 壁纸逻辑抽 composable 时行为漂移 | `use-appearance-wallpaper.ts` 只做搬运，不改一行判断；先抽 + typecheck 通过，再改表现层 |
| 删旧组件误伤其它引用方 | 删除前 `grep -rn` 确认引用归零；`SectionItem.semantic.test.ts` / `wallpaper-display-state.test.ts` 等既有测试跟随迁移而非删除 |
| 条件行让卡片只剩 1 行时发丝线悬空 | 分隔线由父组件按可见行计算，不由每行自己渲染 |
| 中英文案缺键 | 新增行的 title/desc 走 `en-US.json` / `zh-CN.json`，两边同步 |
