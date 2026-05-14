# PRD: Intelligence Power 泛化接口与能力路由

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/intelligence-power-generic-api-prd.full-2026-05-14.md`

## TL;DR

Intelligence Power 定义 AI capability、provider、routing、audit 与 quota 的统一能力路由。当前该能力已与 Nexus Provider Registry / AI mirror / 2.5.0 桌面入口收口路线对齐。

## 当前原则

- 通过 capability 调用能力，不直接绑定具体 provider。
- Provider metadata 与 secret 分离；secret 走 secure-store / `authRef`。
- 调用链需要 trace、usage、latency、success/errorCode。
- 不可用能力返回 explicit unavailable/unsupported reason。
- 2.5.0 Stable 只承诺文本 + OCR。

## 当前重点

- CoreApp 默认 `tuff-nexus-default` provider 调用登录态 Nexus `/api/v1/intelligence/invoke`。
- CoreBox AI Ask 与 OmniPanel Writing Tools 使用统一 capability。
- Provider Registry mirror 支持 `chat.completion` / `text.summarize` / `vision.ocr`。

## 关联入口

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/docs/AISDK_GUIDE.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
