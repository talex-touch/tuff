# TuffTransport 实施指南（压缩版）

> 状态: historical done（核心迁移已落地）
> 更新时间: 2026-03-16
> 适用范围: `packages/utils/transport`、`apps/core-app` 主渲插件通信
> 替代入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`
> 深入文档: `IMPLEMENTATION-GUIDE.deep-dive-2026-03.md`

## TL;DR

- 原实施指南覆盖了 Transport 从类型系统到兼容迁移的完整阶段计划。
- 截至当前基线，SDK Hard-Cut A~F 已完成，主链路已切到 typed transport。
- 该文档由“施工手册”转为“历史参考 + 后续治理入口”。

## 当前关注点

- 保持兼容层边界持续收敛（避免新代码回流 legacy channel）。
- 把剩余债务纳入 Wave A（MessagePort 高频迁移、`sendSync` 清理）。
- 所有新增能力优先走 domain SDK，不新增 raw event 直连。

## 回归基线

- `apps/core-app`：`typecheck:node`、`typecheck:web`、定向测试通过。
- 文档基线：`README/TODO/CHANGES/INDEX` 同步记录迁移事实。

## 追溯

- 历史完整阶段拆解与示例：`IMPLEMENTATION-GUIDE.deep-dive-2026-03.md`
