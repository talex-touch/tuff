# LP-03 Implementation Plan

## Implementation

1. 在 `packages/utils` 增加 Context Actions 共享判别联合、provider/结果合同，并扩展 `TuffContext` 与 typed CoreBox event。
2. 新增 CoreBox `ContextActionsProvider`：
   - 解析显式 text/image 输入；
   - 匹配内置 AI/OCR/Browser 动作；
   - 生成 Translation/Snippets/Dev Utils 官方插件条目；
   - 执行动作并生成 activation-scoped success/error item。
3. 将 provider 注册到 `SearchEngineCore`，并在显式 context query 时限制 provider 集合，避免普通搜索噪声。
4. 扩展 OmniPanel 显式快捷键路径：复用选区捕获；无文本时读取图片；打开并聚焦 CoreBox；发送 typed request。保留鼠标面板与直接 show 事件行为。
5. 扩展 renderer `useSearch`：接收 request、构造 context query、退出/清理 context mode，并复用现有 item/action 执行链。

## Validation

- Focused contract/provider/OmniPanel/useSearch tests。
- `corepack pnpm -C "apps/core-app" run typecheck:node`
- `corepack pnpm -C "apps/core-app" run typecheck:web`
- `corepack pnpm -C "apps/core-app" run build`
- `corepack pnpm run lint:changed`
- `git diff --check`
- Electron UI smoke：显式 text request 与 clipboard image request 均进入 CoreBox，动作和执行状态可见。

## Risk And Rollback Points

- OmniPanel selection capture：保持单一实现，不复制 simulated-copy/clipboard restore；focused regression 必须覆盖恢复逻辑和 image fallback。
- Renderer search lifecycle：context request 必须带唯一 session id，并在普通输入/退出时清除，避免 stale query。
- 插件路由：只使用插件 manager + `PluginFeaturesAdapter.createTuffItem`；缺失/禁用插件显示 unavailable。
- AI payload：图片只以内存 base64 调用明确的 vision capability；不得进入文件路径或持久化元数据。
