# 附件进模型 · 技术设计

## 数据流（一次发送）

```
composer 附件(data URL, AiAttachmentImage)
  → useHomeConversation.send: 消息对象已挂 attachments（现状）
    → 【新】buildPayload: messages 末条 user 消息带 attachments 字段
      → transport(structuredClone 安全: 纯字符串字段)
        → intelligence-service → PiCliProvider
          → 【新】spillAttachments(main): data URL 校验→ os.tmpdir()/tuff-attach-<uuid>.<ext> 落盘
            → buildPiArgs: [@path1, @path2, ..., prompt]（pi 的 @files 位置参数）
              → 回合 finally: unlink 临时文件
```

## 契约

- 类型（双镜像：packages/utils/types/intelligence.ts + packages/tuff-intelligence 对应文件）：
  ```ts
  interface IntelligenceMessageAttachment {
    type: 'image'
    /** data URL；仅 image/png|jpeg|webp|gif */
    dataUrl: string
    name?: string
  }
  // IntelligenceMessage 增可选 attachments?: IntelligenceMessageAttachment[]
  ```
- 落盘校验（main 侧，spillAttachments）：
  - 前缀必须匹配 `data:image/(png|jpeg|webp|gif);base64,`；否则该附件跳过并记 warn（不炸整轮）
  - 单附件解码后 ≤ 10MB，超限跳过记 warn；扩展名由 MIME 决定，不信任 name
  - 临时文件 0600
- buildPiArgs：附件路径作为**位置参数**加在 prompt 之前（`pi [options] [@files...] [messages...]`）；无附件时参数形状不变（既有测试不受扰）
- 降级：非 pi 提供方忽略 attachments 字段（类型可选=天然兼容）；renderer 侧 UI 提示按「本轮是否携带」显隐

## UI 语义

- 发送时刻有附件 → 该消息不再渲染 attachmentNotSent 提示
- 历史恢复的消息（object URL 失效）→ 保留提示（现状不变）——判据：消息来自 restore（无 dataUrl 可发）
- 实现上：send 时把「已发送给模型」标记挂消息 meta（sentToModel: true），渲染以此显隐提示

## 回退

- 类型字段可选 + provider 忽略未知字段 → 任一段落单独回退不破坏其余
- 落盘失败/全部跳过 → 行为等同今日（纯文本轮），提示保留

## 边界（不做）

- 附件字节持久化进历史（另立项）
- 非图片附件（files/html）进模型
- 每消息级 vision 能力探测
