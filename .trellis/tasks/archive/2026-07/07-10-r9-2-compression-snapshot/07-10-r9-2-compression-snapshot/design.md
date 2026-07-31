# CompressionSnapshot Design

## Existing Storage

复用 `intelligence_compression_snapshots`：goal、currentState、decisions、constraints、artifacts、openQuestions、sourceTurnFrom、sourceTurnTo、metadata、createdAt。除非实现调研证明 CAS 无法复用 session 现有更新时间/summary 指针，否则不新增表。

## Service Contract

在 ContextHygiene host service 增加结构化 create/list/latest 能力，并让 finalize/compression orchestration 调用统一 validator。renderer/plugin 不直接写 snapshot 表。

输入经过：

1. session 与 source turn range 存在性/顺序检查。
2. 字段规范化、长度和数组项上限检查。
3. privacy/fact-state 检查。
4. SQLite transaction 写 snapshot + checkpoint + CAS session summary。

## CAS

压缩请求携带 expected summary snapshot/version。事务中只有当前 session 仍匹配 expected value 时更新；否则回滚 snapshot/checkpoint 或将结果明确标记 stale 且不设为 current。实现优先选择不留下误导性 current snapshot 的原子事务。

## Package Consumption

ContextPackage builder 只读取 session 当前有效 snapshot，按 token budget 生成 `summary` item。metadata 记录 snapshot id、source range、checkpoint id 和 token estimate，不记录原 turns。

若 snapshot 引用的 memory 已 tombstone，builder 必须在注入前排除相应事实或整个受影响 item，并记录 `excluded: tombstone`。无法安全局部移除时 fail-closed 排除整个 snapshot item。

## Failure Model

- validation failure：拒绝持久化，返回稳定 code。
- model/parse failure：不写 snapshot/checkpoint，不删 turns。
- CAS conflict：不更新 current summary，要求基于新版本重试。
- package read failure：退化为 recent turns，不伪造 summary。
