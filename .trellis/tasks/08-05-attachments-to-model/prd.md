# 附件随发送进入模型（pi @files 通道）

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。起因：用户问「为什么目前附件不会发送给模型」——任务④把附件做成 UI-only（气泡下有「附件不会发送给当前模型」提示），管线三处无通道。

## Goal

首页会话发送图片附件时，模型真正「看到」图片：附件字节进入 pi 的 `@files` 位置参数通道（`pi [options] [@files...] [messages...]`，已核实支持），提示文案随之退场。

## Requirements

- 图片附件（AiAttachmentImage，data URL）随 chat payload 进主进程，pi 提供方落盘临时文件并以 `@<path>` 传给 pi；回合结束清理
- 消息类型的附件字段走双镜像协议约定（packages/utils 与 packages/tuff-intelligence 同步）
- 重试（regenerate/retry）时附件不丢——payload 重建须重含附件
- 非图片附件与非 pi 提供方：优雅降级（不发送、保留提示文案），不报错
- UI：能发送时撤掉「附件不会发送给当前模型」提示；恢复的历史会话中附件仍不可发送（object URL 已死），保持提示

## Acceptance Criteria

- [ ] 单测：data URL → 临时文件 → `@path` 参数拼装（含清理、多附件、非法 data URL 拒绝）
- [ ] 单测：payload 含附件、retry 重含附件、非 pi 路径不携带
- [ ] 手动冒烟：真发一张截图问「图里是什么」，回复能描述图片内容（需 vision 模型；证据贴任务 research/）
- [ ] typecheck×2 / lint / 相关 vitest 全绿

## Notes

- 中等复杂度：design.md + implement.md 齐备后 start。
- 历史持久化附件字节不在本任务范围（存储成本与 8KB 截断策略另立项）。
