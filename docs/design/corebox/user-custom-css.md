# 用户自定义 CSS 约定与安全限制

## 背景

本项目允许用户在 **Layout Atom** 与 **CoreBox Theme** 中输入自定义 CSS，以便高级用户进行更自由的样式组合。

为避免显而易见的高风险注入，本项目使用“保守拦截”的轻量 sanitizer。

## Sanitizer 实现

- `sanitizeUserCss`：`/apps/core-app/src/renderer/src/modules/style/sanitizeUserCss.ts`

### 阻止的内容（直接返回空字符串）

- `@import`
- `url(`
- `expression(`
- 任意 `<` / `>`（防止 HTML 注入）
- `</style>` / `<script>` / `</script>`
- 长度超过上限（默认 8000）

## 使用约定

### Layout

自定义 CSS 注入点：`LayoutShell.vue`。\n
建议选择器以 `.AppLayout-Container` 为根，例如：\n

```css
.AppLayout-Container[data-variant='custom'] .AppLayout-Header {
  backdrop-filter: blur(12px);
}
```

### CoreBox

自定义 CSS 注入点：`CoreBox.vue`。\n
建议选择器以 `.CoreBox-Wrapper` 为根，例如：\n

```css
.CoreBox-Wrapper .BoxItem:hover {
  transform: scale(1.02);
}
```

## 注意事项

该 sanitizer 不是严格的安全沙箱。\n
若未来需要更强的隔离能力，应考虑：\n
- 对 CSS 做 AST 解析并强制前缀作用域\n
- 仅支持“声明块”型配置（不允许任意 selector）\n
- 将样式注入限定到 shadow root 等更强隔离方式

