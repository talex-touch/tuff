# 附件进模型 · 执行计划

## A1 · 类型与 payload（renderer + utils 双镜像）

- [ ] IntelligenceMessageAttachment + IntelligenceMessage.attachments?（utils 与 tuff-intelligence 双镜像；查既有镜像文件对应关系）
- [ ] useHomeConversation：send/retry 构建 payload 时把图片附件（type==='image' 且有 dataUrl）放进末条 user 消息；消息 meta 记 sentToModel
- [ ] 单测：payload 含附件、retry 重含、非图片不带、restore 消息不带
- 验证：`npx vitest run src/renderer/src/modules/conversation` + typecheck:web

## A2 · pi 提供方落盘与参数（main）

- [ ] providers/ 新增 attachment-spill.ts：validate+decode+写临时文件（0600）+cleanup 句柄；MIME 白名单 png/jpeg/webp/gif、≤10MB、坏 data URL 跳过记 warn
- [ ] pi-cli-runtime buildPiArgs：@paths 位置参数；pi-cli-provider 回合 finally cleanup
- [ ] 单测：拼装顺序、多附件、坏 URL 跳过、超限跳过、清理调用、无附件形状不变
- 验证：`npx vitest run src/main/modules/ai/providers` + typecheck:node

## A3 · UI 提示与冒烟

- [ ] HomePage：attachmentNotSent 按消息 meta.sentToModel 显隐；i18n 若需新文案走精准 Edit 插键（多会话并发，禁整文件重写）
- [ ] 手动冒烟：真图问答，证据（截图/回复文本）存 research/vision-smoke.md
- 验证：lint + typecheck:web；冒烟证据在档

## 提交切分

A1+A2 一枚（管线），A3 一枚（UI+证据）。
