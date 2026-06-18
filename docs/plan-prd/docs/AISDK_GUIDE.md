# AI SDK Guide

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/AISDK_GUIDE.full-2026-05-14.md`

## TL;DR

AI SDK 用于通过统一 capability/provider/audit 入口调用 AI 能力。当前 2.5.0 Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；OmniPanel、Agent、Workflow、Scene 编排按 MVP/Beta 或后续推进。

## 当前使用原则

- 优先复用 `@talex-touch/tuff-intelligence` 与 domain SDK。
- Provider secret 不得进入普通配置，必须通过 secure-store 或 `authRef`。
- 审计默认不保存完整 prompt/response。
- 不可用能力返回明确错误码和 reason，不伪成功。
- 插件调用 AI 需声明权限，复制结果需 `clipboard.write`。

## 当前能力边界

- Stable：CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、Nexus/provider routing、固定失败路径。
- Beta：OmniPanel Writing Tools、Workflow `Use Model`、Review Queue、模板中心、Skills Pack。
- Experimental：Assistant、多模态生成编辑、多 Agent 长任务、Scene runtime 全量 orchestration。

## 关联入口

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
