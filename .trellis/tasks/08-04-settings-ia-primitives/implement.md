# 执行计划 · ② 设置页信息架构 + 行式基础组件

## 检查清单

### A. 侧栏设置上下文

- [x] A1 `ShellNavItem` 增加 `variant: 'plain' | 'raised'`，raised = `$bg` + 1px `$border` + `$text-primary`/500；plain 用 `1px solid transparent` 保持等高
- [x] A2 `ShellBackRow.vue`：padding [5,8]、gap 6、radius-md、`chevron-left` 14 + 12.5 文字；返回走 `useSecondaryNavigation`，无历史回落 `/`
- [x] A3 `ShellSidebar` 按 `route.path.startsWith('/setting')` 分支两套上下文
- [x] A4 设置上下文：BackRow + `搜索设置`（无 kbd）+ 三组 9 项 + 底部版本号
- [x] A5 首页上下文：「新建对话」改用 raised 变体

### B. 行式基础组件（`components/settings/`）

- [x] B1 `SettingSection.vue`：组标签 + `radius-lg` 描边容器 + `clip`；另有 `variant="bare"` 供承载自带表面的旧组件
- [x] B2 `SettingRow.vue`：padding [12,16]、gap 16、title/desc + trailing 插槽 + `navigable`
- [x] B3 `SettingDivider.vue`：1px、**左缩进 16 右齐边**
- [x] B4 `SettingChip.vue` / `SettingButton.vue`（primary + secondary）/ `SettingProgress.vue`
- [x] B5 `SettingsPage.vue`：PageTitle + 内容列骨架（gap 20、padding [4,40,36,40]、max-width 940 居中）

### C. 路由与分类页

- [x] C1 9 个分类路由 + `/setting` → `/setting/overview` 重定向；`/` 也改指该路径
- [x] C2 `?section=file-index` / `?section=everything` 守卫重定向（保留 query 其余部分）
- [x] C3 9 个分类页，按父 design.md 4.1 映射表挂载现有 `Setting*.vue`（内部不改）
- [x] C4 总览页：身份带 + 账户（`SettingUser`）+ 常规（`SettingLanguage`）
- [x] C5 移出侧栏的入口落位：`/application`→插件与工具、`/store/installed`→插件与工具、`/downloads`→网络与更新、风格→外观（全幅挂 `ThemeStyle`）、`Storagable`→存储、`PluginNavTree`→插件与工具
- [x] C6 每个分类页 `keepAlive` + `keepAliveKey: setting-<category>`
- [x] C7 **计划外**：hero 的 Lightfall WebGL 特效按用户要求保留 —— 抽成 `composables/useLightfallCanvas.ts`，身份带与 `SettingHeader` 共用，消除 350 行着色器重复

### D. 验证

- [ ] D1 9 个分类均可直达，`/setting` 正确重定向
- [ ] D2 旧深链 `?section=file-index` / `?section=everything` 仍可用
- [ ] D3 分类切换不丢失各自滚动位置
- [ ] D4 20 个来源组件全部有归属，无组件失联（对照映射表逐项点名）
- [ ] D5 基础组件实测值对齐画板
- [ ] D6 light / dark 双主题
- [x] D7 `typecheck` 0 error + `eslint --max-warnings=0` 干净 + `build:vite` 通过 + `vitest src/renderer` 120 文件 / 633 测试全过

## 质量收敛（best-practice pass）

- [x] `useLightfallCanvas` 尊重 `prefers-reduced-motion` 与 app 自有的 `html[data-low-battery-motion='1']`。CSS 停不掉 WebGL 渲染循环，必须在 JS 里判。降级为渲染一帧静态画面而非整个消失，并监听设置变化。
- [x] `useLightfallCanvas` 补 `ResizeObserver`。原来只听 `window.resize`，但画布尺寸也会在窗口不变时改变（设置内容列是 max-width 驱动、侧栏切上下文）。
- [x] `SettingRow` 的 `navigable` 改为拉伸命中区，不再把整行包成 `<button>` —— trailing 插槽要放开关和按钮，交互元素嵌套进 button 是无效 HTML 且破坏键盘/读屏。
- [x] `ShellNavItem` 补 `aria-current="page"`。
- [x] 首页 composer：随内容增高（上限 200px）、空输入时发送键禁用、焦点指示用 `:focus-within` 提到整张卡片而不是在卡片内再套一圈、`max-width` 改用 `--shell-sidebar-width` 而非硬编码 320。

### 焦点指示重设计（`styles/accessibility.scss`）

原实现三个实质缺陷，不只是"偏粗"：

1. `*:focus-visible` 里带了 `border-radius: 4px`，**强改每个获得焦点元素的圆角** —— 胶囊形控件一聚焦就被切成方角。现代 `outline` 本身就跟随元素自身圆角，这行既多余又有害，已删。
2. **单色环**。accent 环需与紧邻背景有 3:1 对比（WCAG 2.2 SC 2.4.11），但本 app 恰恰会聚焦 accent 色元素 —— 主按钮、`primary-soft` 底的选中导航项。蓝环压蓝底直接消失。
3. `box-shadow` 用 `--tx-color-primary-light-9`（近白），深色主题下是刺眼白晕，浅色下又几乎不可见，且不随主题变化。

新方案为**双色环**：内层 accent（`outline` 2px，紧贴元素）+ 外层中性高对比（`box-shadow` 至 4px）。绘制顺序天然分层 —— 外层阴影覆盖 0–4px，outline 画在其上覆盖 0–2px。两者都跟随元素自身圆角。中性外环保证任意底色（含 accent 底色）下可辨。

- 亮色 `rgb(0 0 0 / 58%)` / 暗色 `rgb(255 255 255 / 72%)`
- `html.contrast` / `html.dark.contrast` 加粗到 3px + 6px 并提高中性环不透明度；原代码只有 `@media (prefers-contrast: high)`，接不到 app 自己的对比度开关（且 `high` 非标准值，已改 `more`）
- `.skip-to-main` 保持 `:focus` 而非 `:focus-visible`（跳转链接必须在程序化聚焦时可见）
- `SettingRow-Hit` 特例：它铺满 `overflow: hidden` 的卡片整行，外扩环会被裁掉，改为 `outline-offset: -3px` 画在内侧并去掉中性环（卡片内部是已知平整底色，accent 环对比已足够）

### 着色器双模式（`useLightfallCanvas`）

原效果只有加法混合（`SRC_ALPHA, ONE`）一种合成方式 —— 加光对白底不产生变化，所以身份带被迫做成深色。为了让身份带回到画板的 `$bg` 浅色面，给着色器加了第二种合成模式：

| 模式 | 合成 | 上色 | 适用 |
|---|---|---|---|
| `glow` | `SRC_ALPHA, ONE`（加法） | 亮色光条 | 深色面 |
| `ink` | `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`（常规） | 暗色墨迹 | 浅色面 |

由 `uInk` uniform 选择分支，**JS 侧的 blendFunc 必须与之一致** —— 只改其中一个会让效果整个洗掉。ink 的 alpha 用 `uOpacity * 0.48`，对齐 glow 的 `uOpacity * 0.52` 上限，使同一个 `uOpacity` 在两种模式下强度相当。

`mode: 'auto'` 按主题选择（暗色 → glow，亮色 → ink），并用 `MutationObserver` 监听 `<html>` 的 class 变化实时切换。**这是必需的** —— 暗墨压暗底同样看不见，一刀切任一模式都会在另一主题下失效。

同时补了编译/链接/uniform 缺失的告警日志：原实现全部静默 `return`，着色器坏掉时画布只是空白，和"设计如此"无法区分。

**踩到的坑**：GLSL 注释里写了反引号，直接终止了承载着色器的 JS 模板字符串，报成 TS 语法错误。

## 与设计稿的偏离（用户指示）

1. **侧栏尺寸较画板更紧凑**（padding 14→10、gap 10→6、导航项 [7,10]→[6,9]、搜索框 32→30），用户看过实机后要求。
2. **图标用 `ri` 代替 lucide**，`folder-search` 无对应项，用 `file-search-line`。

身份带一度改为深色底以承载加法混合的特效，现已随 ink 模式回到画板的 `$bg` 浅色面 —— 该项偏离已消除。

## 验证命令

```bash
cd apps/core-app && npm run typecheck
cd apps/core-app && npx eslint --no-warn-ignored --max-warnings=0 "src/**/*.{ts,vue}"
cd apps/core-app && npm run build:vite
```

## 回退点

本子任务不删除既有 `Setting*.vue`，只新增分类页与路由。回退 = revert 本子任务的提交，`/setting` 回到单页长滚动。
