# AI Elements (elements.ai-sdk.dev) 目录清单 · 2026-08-05

## 已有对应（tuffex 现存，无需复刻）
Conversation→TxConversationStream/TxAiConversation · Message→TxAiMessage · Prompt Input→TxChatComposer · Reasoning→TxReasoningDisclosure · Tool→TxToolCallCard · Attachments→TxAttachmentTray · Code Block→TxCodeBlock · Shimmer→TxTypingIndicator/骨架 · Model Selector→应用层 HomeModelMenu

## 缺口（Chatbot 组）
Chain of Thought（多步推理时间线，区别于单折叠 Reasoning）· Checkpoint · Confirmation（工具执行确认）· Context（token 用量环）· Inline Citation · Plan · Queue · Sources · Suggestion（后续追问 chips）· Task

## 缺口（Code 组，按需挑选）
Artifact · Web Preview · File Tree · Snippet · Stack Trace · Terminal(已有 XTerm 域) · Test Results · Sandbox/JSX Preview(React 专属，Vue 侧需重设计)

## 其他
Image · Open In Chat；Voice 组（音频播放/麦克风/转写）与 Workflow 组（Canvas/Node/Edge）暂缓。

## 优先级建议（服务工具链路）
P0：Confirmation、Sources、Suggestion、Context、Chain of Thought（工具循环 UI 直接要用）
P1：Task/Plan/Queue、Inline Citation、Artifact
