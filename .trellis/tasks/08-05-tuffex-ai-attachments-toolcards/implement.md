# ③ 附件与工具卡片 执行计划

前置：`design.md` 已过审。工作目录 `packages/tuffex`。零新依赖。

## 顺序清单

### S1 分部模型 + TxAiMessage parts 渲染
- [x] `ai-elements/src/types.ts`：AiMessagePart 四类 + AiAttachment 判别联合 + `parts?` 可选字段
- [x] `ai-elements/src/TxAiMessage.vue`：parts 分支渲染、`markdown-renderer` 插槽、streaming 传递、`tool-result` 透传（tool-call/reasoning/attachment 三类先以占位渲染，S2/S4 落地后替换真组件）
- [x] 测试：既有 ai-elements 用例全绿 + parts 分派新用例
- 验证：`cd packages/tuffex && pnpm vitest run packages/components/src/ai-elements`

### S2 attachment-tray
- [x] `attachment-tray/src/TxAttachmentChip.vue`：文件 chip（图标/名称/大小/删除/取消/进度）
- [x] `attachment-tray/src/TxAttachmentTray.vue`：缩略网格 + chip 列表 + TxModal 预览查看器（prev/next）
- [x] TxAiMessage 的 attachment 分部接真托盘（只读模式）
- [x] 测试：混排/removable/进度取消/预览/open 事件
- 验证：vitest 过滤 attachment-tray + ai-elements

### S3 TxChatComposer 扩展
- [x] paste 图片抽取 → `attachmentAdd`（`preventDefault` + 原 `paste` 照发）
- [x] drop 交互：dragover/dragleave 计数器 + `is-dragover` 高亮 + drop 派发
- [x] `isComposing` Enter 守卫（补缺口）
- [x] 测试：三项新行为 + 既有 chat-composer 用例全绿
- 验证：vitest 过滤 chat

### S4 tool-call-card + reasoning-disclosure
- [x] `tool-call-card/src/TxToolCallCard.vue`：四态 + 折叠 + logs 流式区 + result 插槽（尺寸约束）+ retry
- [x] `reasoning-disclosure/src/TxReasoningDisclosure.vue`：shimmer 思考态 + 时长完结态 + 折叠动画
- [x] TxAiMessage 的 tool-call / reasoning 分部接真组件
- [x] 测试：四态序列 / aria / retry / result 插槽回退 / duration 格式化
- 【review 门】mock 事件序列人工过一遍动画手感（高度过渡、状态图标切换、reduced-motion）
- 验证：vitest 过滤 tool-call-card + reasoning-disclosure + ai-elements

### S5 注册与收尾
- [x] `components.ts` 增 3 行（字母序插位）；各 `index.ts` withInstall + 类型导出
- [x] 全量验证

## 验证命令（S5 全量）

```bash
cd packages/tuffex
pnpm test
pnpm typecheck
pnpm build
pnpm lint
```

## 回滚点

- S1 类型为纯可选增量，TxAiMessage 分支可独立 revert。
- S2/S4 新目录整删即回滚；S3 是 chat-composer 单文件增量。
