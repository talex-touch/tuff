# CoreBox 主题与自定义样式

## 用户故事

作为用户，我希望 CoreBox（搜索框）能够：\n
- 调整 Logo 位置（前置/后置/隐藏）\n
- 调整输入框边框/圆角/背景\n
- 调整结果列表圆角/间距/hover 行为\n
- 在可控范围内注入自定义 CSS

## 入口

### 配置存储

- `CoreBoxThemeConfig`：`/packages/utils/common/storage/entity/layout-atom-types.ts`\n
- 默认值写入 AppSettings：`/packages/utils/common/storage/entity/app-settings.ts`

### 运行时使用

- 主题解析：`/apps/core-app/src/renderer/src/views/box/theme/useCoreBoxTheme.ts`\n
- 应用到 UI：`/apps/core-app/src/renderer/src/views/box/CoreBox.vue`

### 设置页

- 主题选择器与自定义 CSS 输入：`/apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`

## 关键实现

### 1) CSS 变量注入

CoreBox 根容器 `CoreBox-Wrapper` 注入 `themeCSSVars`，并根据主题生成 class：\n
- `CoreBoxInputBorder-*`\n
- `CoreBoxInputBg-*`\n
- `CoreBoxResultHover-*`

### 2) Logo 位置

通过 `v-if` 控制显示/隐藏，并使用 `order` 将 Logo 移动到输入框后方。

### 3) 自定义 CSS

用户 CSS 会被保守 sanitizer 处理后注入 `<style>`（见 `sanitizeUserCss`）。\n
建议用户以 `.CoreBox-Wrapper` 为作用域书写选择器。

