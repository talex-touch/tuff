# touch-image

`touch-image` 是仓库里的示例图片插件，主要用于验证图片协议、插件存储和拖拽历史浏览体验。

## 开发入口

- 调试：`pnpm -C "plugins/touch-image" run dev`
- 构建：`pnpm -C "plugins/touch-image" run build`
- Lint：`pnpm -C "plugins/touch-image" run lint`

## 当前约束

- 仅保留插件运行需要的入口、组件和历史记录逻辑。
- 已移除 Vite starter 资源与临时配置残留，避免示例仓面继续混入模板资产。
