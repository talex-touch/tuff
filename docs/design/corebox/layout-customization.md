# 布局选择、预览与原子编辑器（Settings → Styles）

## 用户故事

作为用户，我希望在 Settings → Styles 中：\n
1) 能明显看出不同布局的区别；\n
2) 能横向滚动浏览多种布局；\n
3) 能通过原子化参数自定义布局并保存为“自定义布局”。

## 入口

- 页面：`/apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- 布局卡片列表：`/apps/core-app/src/renderer/src/views/base/styles/LayoutSection.vue`
- 原子编辑器：`/apps/core-app/src/renderer/src/views/base/styles/LayoutAtomEditor.vue`

## 关键行为

### 1) 横向滚动布局预览

`LayoutSection` 将布局卡片容器改为横向滚动（`flex + overflow-x`），方便快速浏览多种布局。

### 2) 预览差异化

预览框架：`/apps/core-app/src/renderer/src/components/layout/LayoutPreviewFrame.vue`\n
通过 `data-variant`（如 `compact/minimal/classic/card/dock`）对预览结构做差异化样式，使卡片“一眼能分辨”。

### 3) 原子编辑器保存为 Custom

编辑器会将任何改动写入：\n
- `appSettingsData.layoutAtomConfig`（`preset: 'custom'`）\n
- `appSettingsData.layout = 'custom'`\n

这样 DynamicLayout 会加载 `custom` layout（复用 SimpleLayout），并通过 `LayoutShell` 注入用户的原子配置。

