# TouchX UI 更新日志

## [Unreleased] - 2026-05-21

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
