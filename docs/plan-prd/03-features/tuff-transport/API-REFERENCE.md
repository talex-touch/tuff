# TuffTransport API 参考（压缩版）

> 状态: historical done（主链路已迁移）
> 更新时间: 2026-03-16
> 适用范围: `packages/utils/transport` 与主渲插件通信
> 替代入口: `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.md`、`docs/plan-prd/TODO.md`
> 深入文档: `API-REFERENCE.deep-dive-2026-03.md`

## TL;DR

- TuffTransport 的核心事件模型、SDK 调用模式和迁移路径已在主线落地。
- 当前重点是保持兼容边界收敛，不新增 legacy 风格调用。
- 本页保留“使用规则与验收口径”，详细 API 形态见 deep-dive。

## 使用规则（当前有效）

1. 使用 `defineEvent` 定义 typed event，避免字符串事件散落。
2. 通过 `useTuffTransport()` 发送/订阅，统一错误处理与重试语义。
3. 新功能优先 domain SDK，不新增 `transport/legacy` 依赖。

## 质量门槛

- typecheck/lint 必须通过。
- 不允许新增 raw channel 直连。
- 与 `README/TODO/CHANGES` 的迁移事实保持一致。

## 追溯

- 完整 API 参数、事件类型、示例：`API-REFERENCE.deep-dive-2026-03.md`
