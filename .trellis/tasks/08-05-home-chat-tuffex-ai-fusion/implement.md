# ④ 主界面聊天融合 执行计划

前置：`design.md` 已过审。工作目录 `apps/core-app`；tuffex 侧零改动。基线是工作树里未提交的 08-04 R2（29 例 + typecheck 已验绿），提交计划分列两者文件。

## 顺序清单

### S1 useHomeConversation 附件增量
- [x] `ConversationMessage.attachments?: AiAttachment[]` + `send(text, attachments?)` 附到 user 消息
- [x] 测试：附件挂 user 消息、provider payload 不含附件；既有 29 例全绿
- 验证：`cd apps/core-app && npx vitest run src/renderer/src/modules/conversation`

### S2 消息流替换（HomePage.vue）
- [x] `HomePage-Stream` 换 TxConversationStream（items/item-key/streaming + 模板 ref）
- [x] `#item` 插槽迁移既有消息版式：user 气泡 + 助手 TxStreamMarkdown/TypingIndicator/错误块（retry 条件保持末条）
- [x] 删手写滚动全套；composer 测高改喂 scroller padding 与浮钮偏移；restore 后显式 `scrollToBottom()`
- [x] token 桥接块 + 720px 列宽移到逐项包裹层
- 验证：`npm run typecheck:web`

### S3 composer 附件交互
- [x] `pendingAttachments` + File→AiAttachment（objectURL 生命周期管理）
- [x] paste 抽取 / drop 计数器高亮 / 「+」接隐藏 file input
- [x] TxAttachmentTray removable 入 composer；user 消息内只读托盘 + 降级提示行
- [x] i18n 四 key（zh-CN / en-US）
- 验证：typecheck + 手动 dev 冒烟

### S4 全量验证与收口
- [x] `npx vitest run src/renderer/src/modules/conversation`（全绿）
- [x] `npm run typecheck`（node + web）
- [x] `pnpm lint`（根目录，范围含 core-app 改动文件）
- [x] 【review 门 · CDP 代验 2026-08-05】带 `--remote-debugging-port` 驱动 dev 实例逐项跑完 1-5（截图存 /tmp/tuff-verify/）：流式+代码高亮+mermaid 出图、浮钮/跟流/回底、附件托盘/灯箱/降级提示、落库+冷路径恢复落底、深色主题、reduced-motion 动画归零。抓出并修复 4 个真机 bug（见 journal）；主观动画手感留日常使用验证
- [x] 行为不回退清单逐项过（代码路径核验：conversation 管线零逻辑改动，31 例全绿）（design §6）

## 提交划分（Phase 3.4 出计划时执行）

- 08-04 R2 基线文件（非本任务产物，提交归属由用户定：随 ④ 前置提交 or 用户手动）
- ④ 产物：HomePage.vue、useHomeConversation.(ts|test.ts)、lang 两份、任务目录

## 回滚点

- S1 独立可弃；S2/S3 集中在 HomePage.vue 单文件，revert 即回滚。
