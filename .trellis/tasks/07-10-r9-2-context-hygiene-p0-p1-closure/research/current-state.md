# R9.2 Current-State Research

> 调研日期：2026-07-10
> 口径：只记录已由当前代码与项目文档确认的事实，不把规划项写成已完成。

## 已落地底座

- SQLite 已有 context session、turn、checkpoint、compression snapshot、memory、tombstone 和 context package log 表。
- `ContextHygieneService.prepareTurn()` 已生成 ContextPackage，并能消费 R9.1 retrieval/citation，记录 included/excluded、pruned、policy-blocked 与 degraded metadata。
- typed Intelligence SDK 已覆盖 package/checkpoint/memory 的读取、评估、保存、启停和 tombstone 删除。
- Intelligence Audit 已有 metadata-only explain drawer；Memory Review 已有手动 evaluate、显式 save、list、enable/disable 和 delete 最小闭环。
- 官方 `touch-intelligence` 已在 CoreBox AI Ask 前调用 `contextPrepareTurn`，并在显式“记住”意图时调用 `contextEvaluateMemory`；自动长期记忆仍关闭。

## 2026-07-11 复核

### 已闭环

- CoreBox `text.chat` 已通过 host-owned context execution 统一 prepare、revalidate、assemble、invoke/stream 和 finalize；安全 retrieval/memory/recent-turn 内容会进入 provider messages，而不是只进入 metadata。
- Memory 已按 enabled、TTL、privacy、tombstone、scope 与稳定 `scopeRef` fail-closed 过滤，并在 provider invoke 前最终复核；插件 facade 已移除 host Memory list/save/enable/delete 与 raw prepare 能力。
- 官方 `touch-intelligence` 已迁移到 `contextInvoke/contextStream`，CoreBox widget 提供 new/continue/stateless，并只展示 package/session/citation/token/degraded 安全摘要。
- macOS arm64 packaged Electron、隔离 profile 与受控本地 Provider 已验证真实回答、宿主 continuation payload、stateless current-only payload，以及 `empty-fts-query` degraded 可见状态。
- AI widget 的 context summary 已避免 action/meta/custom payload 共享引用；host strict serializer 不再把 widget 摘要替换成 `[Circular ...]`。
- Local knowledge FTS5 查询已安全拆分并引用 Unicode token，带连字符输入不再触发 `no such column` degraded。

### 剩余关键缺口

- CompressionSnapshot 仍只有 schema/data 底座，尚缺结构化校验、source turn range、checkpoint 关联、session summary CAS、失败 degraded 与 package consumption 闭环。
- OmniPanel、Workflow、Assistant 尚无统一 ContextHygiene integration case；CoreBox packaged evidence 不能外推为多入口闭环。
- packaged active-widget 输入快速变化会产生重复 feature execution/provider request；需要在 CoreBox feature dispatch 与插件 request lifecycle 之间建立单次提交/取消 contract，避免重复成本和并发 turn。

## 后续顺序

1. 先修复 active-widget 重复 AI dispatch，并用 provider request count 与 session turn 数证明单次提交。
2. 再完成 CompressionSnapshot 服务闭环。
3. 最后接入 OmniPanel/Workflow/Assistant，并统一 evidence 分级。
4. 不开启自动长期记忆、embeddings/vector DB、本地模型默认启用或 ASR runtime。
5. 任何 SQLite schema/data migration 必须先提交 preflight、旧数据策略与 rollback SQL，再获得显式确认。
