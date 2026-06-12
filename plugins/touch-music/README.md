# touch-music

`touch-music` 是仓库里的示例音乐插件，用来验证插件 UI、TuffEx 组件按需样式和基础音频交互。

## 开发入口

- 调试：`pnpm -C "plugins/touch-music" run music:dev`
- 构建：`pnpm -C "plugins/touch-music" run build`
- Lint：`pnpm -C "plugins/touch-music" run lint`

## 当前约束

- 只保留插件运行必需入口与示例资源，不再保留 Vite starter 资产。
- TuffEx 使用 `base.css` + 组件子路径 `style.css`，避免继续依赖全量 `style.css`。
