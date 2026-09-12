# TouchX UI 更新日志

## [Unreleased]

## [0.6.0] - 2026-09-12

### ✨ 组件增强

- 新增 `TxTextMorph`：按字符粒度在旧值与新值之间做形变过渡，并导出 `TextMorphEngine` / `MorphController` / `MORPH_DEFAULTS` 供 `TxTextTransformer`、`TxBadge` 等自带形变面的组件复用；`@number-flow/vue` 依赖随之移除，Nexus 侧 demo 与文档从 AutoSizer 数字滚动切到新组件。
- `TxToastHost` 重做为可堆叠通知栈：最新的在最前，后面的按 `gap` 与 5% 缩放露出顶边，超过 `visibleToasts` 的完全透明等待；悬停整栈展开并暂停所有倒计时，移开后各自从中断处继续而不是从头计时；收起时宿主 `pointer-events: none`，空列不再吞点击。新增 `position` / `expand` / `gap` / `offset` / `swipeToDismiss`，退场动画补齐（此前只有 0.16s 淡入，退场元素直接消失）。
- `TxSortableList` 拖拽可预期：列表随指针跨越实时重排（预览由组件自己保有，宿主未回写 `modelValue` 时行也会动，拖拽结束后所有权交还宿主），新增握柄与键盘排序路径，`reorder` 仍只在结束时触发一次并携带原始与最终下标。
- `TxTree` 无 `v-model` 时也能选中：内部选中状态与展开同构，新增 `defaultSelectedKeys` 作为种子，`modelValue` 绑定期间忽略种子。
- `TxTransfer` 新增 `minHeight` prop（写入 `--tx-transfer-min-height`），不再被 240px 硬下限撑出容器；行标签改用 `overflow-wrap: anywhere`，不再把 "Quick actions" 断成 "Quick actio / ns"。
- `TxDatePicker` 增加月/年视图、区间选择与过渡动画；`TxCascader` 每一级使用各自锚定的浮层面板；`TxProgressBar` 增加星尘流动与可悬停分段。
- `TxTabBar` 补齐与 `TxFlatRadio` 一致的 variant / size 组合，滑动指示器改由一份共享测量驱动（首次点击前就位）；`TxFlatRadio` 增加 `xl` 档位。
- `TxAlert` 增加状态图标、入场动画与可关闭回退。

### 🎨 外观与主题

- 所有阴影回到同一光源；抬升面锚定到轨道并压柔阴影，画廊单元格不再挤压自身。
- BUI 深色 ramp 回归中性灰：每档保留原有绿色通道（亮度不变），只去掉原先 +3..+5 的蓝偏，`--tx-bui-line` 与 `--tx-fill-color` 对齐；浅色 token 不动。
- 列表行统一 hover / active / 对齐；下拉项 hover 改为面板式；折叠头重绘为描边 chevron，折叠框架重新设计。
- 步骤条标记与连接线重绘并补过渡动画；BlowDialog 卡片重建；头像跟随主题取色；状态徽标图标归位到端帽。
- 自适应带与 GlowText 的离场改为真正离开，而不是在原处溶解或犹豫。

### 🐛 组件修复

- BUI 组件的 `bui-scope` reset 改由 `:where()` 包裹，组件自己写的 `&__name` 按钮样式不再被 `.tx-bui-x button` 的 (0,1,1) 静默压过（`TxSidebarNav` 行高回到 31.5px，`TxSearchPanel` 选项恢复内边距/字号/颜色）。
- `TxGroupBlock` 的行扁平化选择器实际命中；`TxRow` 负 gutter 的成因补齐，网格恢复方正。
- 对话框不再裁切长 token，内容体可滚动；`TxSelectionActions` 不再在用户操作时把自己关掉；`TxTabs` 指示器首次点击前可见。
- Picker 行标签不再重复渲染、滚轮不再卡顿、能滚到最后一行。3D 鼓形方案落地后因命中区随 transform 迁移（居中行挡住相邻行）而整体回退，最终保留平铺列，以及两个与鼓面无关的修复。
- `TxSlider` 分段停点变圆且可命中；滑块拇指沿用 radio 指示器的果冻感，radio 指示器收进组边框。
- 浮层面板锚定到文档而非视口；Nexus 文档的 prose 样式不再渗进组件 specimens。
- `TxStreamMarkdown` 不再重复内联 GitHub markdown 样式表（SFC `@import` 与按 chunk 去重导致 103.3 KiB 表发两遍）。

### ⚡ 性能优化

- 组件样式不再把依赖 CSS 复制进每个 `style.css`：依赖改为 emit 共享样式的一次引用，发布集 2.2 MiB → 743 KiB。
- 共享样式通过 `style-deps.json` 展开为「每个样式表一次 import」，同一份 base-surface 规则只加载一次：五个组件的页面 208 KiB → 104 KiB。
- 导出 CSS 开启 `cssMinify`（JS 仍保持未压缩，便于依赖方调试与自行打包）：`components.css` 663.5 → 541.2 KiB，`base.css` 34.2 → 29.3 KiB；`audit:size` 的完整 CSS 预算以 664 KiB 重新基线。

### 🧩 组件导出

- 新增 `@talex-touch/tuffex/vite`（按需样式注入插件）与 `@talex-touch/tuffex/package.json` 导出。
- 新增 `TxTextMorph` 及其引擎导出；移除 `@number-flow/vue` 依赖。

## [0.5.0] - 2026-09-07

### ✨ 组件增强

- `TxFilterChips` 增加滑动填充、图标与 icon-only 模式。
- `TxCardItem` 宿主可重新指向 hover / active 填充。
- `TxDropdown` 可承载文本输入框，锚定面板的背景在滚动行之下保持不透明。

### ⚡ 性能优化

- 锚定面板改用 transform 定位，`max-height` 保留 size middleware 写入的值。

### 🐛 组件修复

- 交互组件打磨收口：每个交互控件都有 cursor，`TxSlider` 的折射 slab 按尺寸计算而不是缩放。
- `TxStreamMarkdown` 的 PostCSS 产物保持 pack 可解析，构建期剥离非法律注释。

### 🧪 内部

- 类型审计可从 workspace 解析同级包（#1841）；补齐 spring / fill 契约与视觉任务证据文档。

## [0.4.0] - 2026-09-01

### 💥 破坏性变更

- 收拢 button / icon 组件族：`TxIconButton`、`TxCopyButton` 移入 `@talex-touch/tuffex/button`，`TxOsIcon` 移入 `@talex-touch/tuffex/icon`；深子路径 `./flat-button`、`./icon-button`、`./copy-button`、`./os-icon`（含各自 `style.css`）随之移除。根入口导出的组件名与类型不变，仅深子路径消费方需要改导入来源。
- 删除冗余组件 `TuffFlatButton`（连同 `FlatButtonProps`、`TuffFlatButtonInstance`）：其能力与 `TxButton variant="flat"` 完全重复，请直接使用后者。

### 🧹 包体职责收口

- TuffEx 包移除本地 VitePress `docs:*` / playground 展示入口，源码包只保留 build、watch、lint、test、typecheck 与 package audit 脚本。
- 运行时 Demo 与公开文档统一迁移到 Nexus 承载，本地预览改为 `pnpm -C "apps/nexus" run dev`。

## [0.3.9] - 2026-06-12

### 🧩 组件导出

- 新增 `@talex-touch/tuffex/<component>` 稳定子路径导出与 `<component>/style.css` 局部样式入口，保留根入口兼容但推荐新代码使用按需子路径导入。
- 新增 `@talex-touch/tuffex/base.css` 基础样式入口，用于按需消费时单独加载共享 token 与全局 utility；`style.css` 继续保留为全量样式入口。
- Core App 的 TuffEx 受控注册逻辑改为按组件子路径动态加载，避免集中注册单个组件时触发根入口全量导出。
- 新增 Vite 按需样式注入插件，用于发布态按组件子路径消费时自动补齐 `<component>/style.css`；Core App 与 Nexus 开发态继续消费源码 SFC 样式，避免重复注入。
- 修复 `@talex-touch/tuffex/utils` 发布入口缺少 JS wrapper 的问题，并新增 `pnpm -C "packages/tuffex" run audit:exports` 校验发布 exports 对应 dist 文件。

### ⚡ 性能优化

- `TxScroll` 的 BetterScroll `pull-down` / `pull-up` 插件改为功能开启时按需加载，避免默认滚动入口静态拉入未启用的下拉刷新/上拉加载插件。
- `TxScroll` 的 pull 插件安装逻辑已抽到独立 helper，并新增 `scroll` 按需入口依赖图审计，防止默认滚动入口回退为静态拉入 pull 插件。
- `TxScroll` 的 wheel/bounce guard/RAF apply 运行时已拆到 `useScrollWheel`，SFC 仅保留模式切换、BetterScroll 初始化、native fallback 和模板绑定。
- `TxCodeEditor` 改为轻量 async wrapper，CodeMirror/YAML 运行时实现延后到真实渲染时加载，并在 `audit:size` 中禁止默认 `code-editor` 入口静态拉入 CodeMirror 依赖。
- 空态 wrapper 组件的局部样式入口改为轻量引用 `empty-state/style.css`，避免 `blank-slate` / `no-data` / `permission-state` 等按需样式重复复制整份 EmptyState CSS，并由 `audit:size` 防回涨。
- `TxBaseAnchor` 的 GSAP 动画运行时已抽到 `useBaseAnchorMotion` 并改为动态加载，默认 `base-anchor` / `button` / `select` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxFlipOverlay` 的 GSAP 动画运行时已抽到 `useFlipOverlayMotion` 并改为动态加载，默认 `flip-overlay` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxButton` 的 `v-wave` directive 改为首次挂载时动态加载，默认 `button` 按需入口不再静态拉入 `v-wave`，由 `audit:size` 防回涨。
- `TxRadioGroup` 的 v-model 延迟提交与 button indicator 动画/拖拽/键盘逻辑已拆到内部 helper，SFC 仅保留组合、provide、模板和样式，并新增 `radio` 按需入口依赖图审计。
- `TxBaseSurface` 的数值解析与 auto-detect / refraction recovery motion 状态机已拆到内部 helper，SFC 从 1150 行降到 725 行，并新增 `base-surface` 按需入口依赖图审计。
- Core App、Nexus 与 `intelligence-uikit` 的应用级样式入口已迁到 `base.css` + 按需局部样式，`audit:size` 现在同时防止根入口和 `@talex-touch/tuffex/style.css` 在这些消费侧回涨。

### 🐛 组件修复

- 修复 `TxTabs` 无法识别 `v-for` 生成的 `TxTabItem` / `TxTabItemGroup` 子项，以及 Nexus 异步注册后子项组件名丢失的问题，避免动态/文档标签页内容显示 `No tab selected`。

## [0.3.8] - 2026-05-29

### 🧩 组件增强

- 增强 `TxDrawer`：支持四方向、统一 `size`、`full` 全屏 prop、Header/Footer 自定义与关闭、TxDivider 分割线、遮罩/透明面板配置，以及移动端默认底部弹出。
- 增强 `TxDivider`：新增 `gradient` 渐变透明分割模式，支持起点、终点与两端透明衰减。
- 补齐 Nexus 侧 `TxDivider` 中英文文档、基础/渐变/垂直分割 demo、组件注册和索引入口。

## [0.3.7] - 2026-05-21

### 🚀 发布链路

- 修复 `@talex-touch/tuffex@0.3.7` 发布前的 lockfile specifier 不一致问题，确保 `pnpm install --frozen-lockfile`、构建与发布 manifest 校验可复现。
- 补齐 Tuffex CI/Publish workflow 对 `pnpm-lock.yaml` 与 workspace catalog 变更的触发，避免依赖规格修复漏跑包级流水线。

### 📚 文档站修复

- 修复组件文档中 `ApiSpecTable` 内联对象数组导致的 VitePress 构建失败，改为在 `<script setup>` 中声明数据后引用。
- 补齐文档主题缺失的 TuffEx 组件注册和旧标签兼容映射，确保 103 个组件页面均可正常渲染。
- 修复 `FlipOverlay`、`GroupBlock`、`Slider`、`Icon`、`Input`、`AvatarVariants` 等文档示例的运行时 warning/error。
- 新增文档站 `logo.svg`，并修正 favicon 路径。
- 补齐 `FlatRadio`、`FlatSelect`、`Transfer` 文档页，并把已有未入口化组件纳入侧边栏导航。
- 补齐 `docs/components/index.md` 中缺失的 `Alert`、`Badge`、`Breadcrumb`、`Card`、`Collapse`、`FlipOverlay`、`Modal`、`Pagination`、`Radio`、`Rating`、`SegmentedSlider`、`Steps`、`TextTransformer`、`Timeline` 入口，组件索引与 sidebar 保持一致。
- 将 `GlassSurface` 基础示例改为独立 Vue demo，修复真实浏览器预览中泄漏 Markdown / HTML 源码文本的问题。
- 将 `Input` 前后缀插槽示例改为独立 Vue demo，修复移动端真实预览中 raw slot markup 撑宽页面的问题。

### 🐛 组件修复

- 修复 `TxInput` 在 flex 容器中的收缩与横向溢出问题。
- 修复 `TxChatMessage`、`TxScroll`、`TxStagger` 在 VitePress SSR / hydration 场景下的客户端结构不一致问题。
- 修复 `TxStatCard` 默认数值与 insight 在文档站中可能被 `NumberFlow` 渲染为空的问题，改为稳定可见的文本基线。
- 修复 `TxTabs` 点击切换后 active nav 与内容不同步、并触发 Vue `setElementText(null)` 控制台错误的问题。

### 🧩 组件导出

- 为 `FlatInput` 增加 `TxFlatInput` 注册名和命名导出，避免文档页组件名与示例标签递归冲突。
- 新增 `TxTextarea`、`TxNumberInput`、`TxDivider`、`TxKbd`、`TxCopyButton` 五个基础补齐组件，并同步导出、文档和最小测试。
- 为文档站注册 `TxFlatRadio`、`TxFlatSelect`、`TxTransfer` 及其子项组件，保证新增页面可以直接渲染。

### ✅ 验证

- 完成组件源码目录、`components.ts` 导出、`docs/components` 页面、VitePress sidebar 与组件索引页对账。
- 真实浏览器桌面静态截图巡检 `111/111 PASS`，移动重点页截图巡检 `37/37 PASS`，明暗主题截图巡检 `222/222 PASS`，交互烟测 `26/26 PASS`。
- 新增 `scripts/audit-docs-inventory.mjs`、`scripts/audit-docs-coverage.mjs`、`scripts/audit-docs-pages.mjs`、`scripts/audit-docs-interactions.mjs` 和 `docs/quality/component-audit-2026-05-21.md`，沉淀可复跑的源码/导出/文档对账、覆盖矩阵、静态、主题、移动与交互 smoke 审计证据。
- 新增 `docs/quality/component-page-matrix-2026-05-21.md`，逐页记录源码、导出、文档、sidebar、索引、桌面截图、主题截图、移动重点页和交互 smoke 覆盖状态。
- `pnpm -C "packages/tuffex" run lint`、`pnpm -C "packages/tuffex" exec vitest run`、`pnpm -C "packages/tuffex" run docs:build`、`pnpm -C "packages/tuffex" run build` 与 `git diff --check -- "packages/tuffex"` 均通过。

## [0.3.4] - 2026-03-08

### 📚 文档优化

- 重写 `README.md`，统一安装、按需引入、工具导出和组件导出约定说明。
- 重写 `README_ZHCN.md`，与英文 README 结构对齐，去除过时 Beta 文案。

### 🧩 组件梳理

- 基于 `packages/components/src/components.ts` 重新梳理组件导出，确认当前导出模块为 **102** 项。
- 按基础导航、表单输入、布局结构、数据状态、反馈浮层、AI内容、动效视觉七大类补齐组件清单，避免文档与实际导出不一致。

## [最新更新] - 2024-07-22

### 🎨 重大设计更新

#### Button 组件全新视觉设计
- 🔥 **镂空透明效果**: 采用透明背景 + 底部 2px 粗边框的现代化设计
- ✨ **优雅悬停效果**: 悬停时轻微背景色 + 边框颜色变化 + 上移动画
- 🎯 **视觉层次优化**: 底部粗边框创造视觉重点，提升用户体验
- 📐 **尺寸规范化**: 统一的最小宽度和高度，确保一致的视觉效果

### ✨ 新功能

#### Button 组件重构
- 🔄 **组件名称更新**: `VcButton` → `TxButton`
- 🎨 **样式类名统一**: 全部使用 `tx-` 前缀
- 📱 **震动反馈支持**: 新增震动反馈功能，提升移动端体验
- 🎯 **完整功能实现**: 支持文档中所有要求的功能

#### 震动工具库
- 📳 **震动 API 封装**: 完整的设备震动功能支持
- 🎛️ **多种震动模式**: 7种预设震动类型
- 🔧 **高级配置**: 支持自定义震动模式和管理器
- 🛡️ **类型安全**: 完整的 TypeScript 类型定义
- 🧪 **单元测试**: 完整的测试覆盖

### 🎨 样式改进

#### 文档排版优化
- 📐 **按钮间距**: 使用 Flexbox 布局，支持自动换行
- 📱 **响应式设计**: 移动端适配，间距自动调整
- 🎯 **视觉一致性**: 统一的组件展示样式

#### 按钮样式增强
- ✨ **现代化效果**: 悬停上移 + 阴影效果
- 🔄 **平滑动画**: 所有状态变化都有过渡动画
- ♿ **无障碍支持**: 聚焦轮廓和键盘导航
- 🎨 **加载动画**: SVG 旋转加载指示器

### 📚 文档更新

#### Button 组件文档
- 🖼️ **可视化示例**: 所有示例都可直接在文档中渲染
- 📖 **完整 API**: 包含所有属性、事件和插槽说明
- 🎯 **震动功能**: 新增震动反馈使用示例
- 💡 **最佳实践**: 提供使用建议和注意事项

#### 工具库文档
- 📳 **震动工具**: 完整的震动 API 使用指南
- 🔧 **高级用法**: 自定义模式和管理器使用
- 🌐 **兼容性**: 浏览器支持情况说明
- 💡 **最佳实践**: 震动反馈使用建议

### 🧪 测试覆盖

#### Button 组件测试
- ✅ **基础功能**: 渲染、类型、尺寸测试
- ✅ **状态测试**: 禁用、加载状态测试
- ✅ **事件测试**: 点击事件和阻止测试
- ✅ **样式测试**: 各种样式变体测试

#### 震动工具测试
- ✅ **API 测试**: 所有公开方法测试
- ✅ **错误处理**: 异常情况处理测试
- ✅ **兼容性**: 不同环境支持测试
- ✅ **管理器**: 震动管理器功能测试

### 🔧 技术改进

#### 类型定义
- 📝 **完整类型**: 所有组件和工具的 TypeScript 类型
- 🔗 **类型导出**: 便于外部使用的类型导出
- 🛡️ **类型安全**: 严格的类型检查

#### 代码结构
- 📁 **模块化**: 清晰的文件组织结构
- 🔄 **可维护**: 易于扩展和维护的代码
- 📚 **文档化**: 完整的代码注释和说明

### 📱 移动端优化

#### 震动反馈
- 📳 **智能震动**: 根据按钮类型自动选择震动模式
- 🎛️ **可控制**: 支持开关震动功能
- 🔋 **性能优化**: 避免频繁震动影响电池

#### 响应式设计
- 📱 **移动适配**: 按钮在移动设备上的最佳显示
- 👆 **触摸友好**: 合适的触摸目标大小
- 🎨 **视觉反馈**: 清晰的交互状态反馈

### 🚀 性能优化

#### 组件性能
- ⚡ **按需加载**: 支持按需导入组件
- 🎯 **优化渲染**: 减少不必要的重新渲染
- 📦 **体积优化**: 精简的组件代码

#### 工具性能
- 🔧 **轻量级**: 震动工具库体积小巧
- 🛡️ **错误处理**: 优雅的错误处理机制
- 💾 **内存优化**: 避免内存泄漏

### 🔮 未来计划

- 🎨 **主题系统**: 完整的主题定制系统
- 🧩 **更多组件**: 持续添加新组件
- 📱 **PWA 支持**: 渐进式 Web 应用支持
- 🌐 **国际化**: 多语言支持

---

## 使用示例

### 基础按钮
```vue
<template>
  <TxButton type="primary" @click="handleClick">
    点击我
  </TxButton>
</template>
```

### 震动反馈
```vue
<template>
  <TxButton 
    type="success" 
    vibrate-type="success"
    @click="handleSuccess"
  >
    成功操作
  </TxButton>
</template>
```

### 自定义震动
```typescript
import { useVibrate } from '@talex-touch/touchx-ui/utils'

const handleClick = () => {
  useVibrate('heavy')
}
```
