# Productize archived ContextHygiene continuation

## Goal

让 CoreBox 显式“继续”在目标 session 已 archived、expired 或超过 idle boundary 时仍能安全工作：宿主创建新 session，只带入经过治理的旧摘要，并把边界原因以 metadata-only typed contract 返回给 UI。修复当前复用旧 `sessionId` 插入导致主键冲突并退化为 current-input-only 的缺口。

## Requirements

- 显式 continue 指向仍活跃且未过期的同 owner/actor session 时，保持原 session 内继续。
- 显式 continue 指向 archived/expired/idle session 时，创建新的随机 session id；不得覆盖、复活或用相同 id 重插旧 session。
- 新 session 只允许继承旧 session 的安全 CompressionSnapshot 或 legacy summary，不注入旧 raw turns、MemoryItem 或敏感内容。
- summary 不可用、含 secret 或受 policy 阻断时 fail-closed；当前输入仍可执行，并返回可解释 continuation status/reason。
- session checkpoint、ContextPackage 和 `IntelligenceContextExecutionSummary` 只返回 source session id、reason、status、summary source type/id 等 metadata，不返回摘要正文。
- 官方 `touch-intelligence` 将 continuation reason 安全投影到 widget，并显示可理解的上下文边界状态。
- invoke 与 stream 继续共用同一 host-owned prepare/assembler 路径；第三方插件不能读取 host Memory 或自行拼 prompt。

## Acceptance Criteria

- [x] archived/expired/idle continuation 创建新 session，checkpoint reason 明确，且无 duplicate-session-id 写入。
- [x] 安全 CompressionSnapshot 优先于 legacy summary；只有摘要进入新 package，旧 raw turns 不进入。
- [x] secret/blocked/missing summary 返回 `excluded`/`unavailable` metadata，不泄露正文且不阻断当前输入。
- [x] typed utils/tuff-intelligence contract 暴露 metadata-only continuation summary，SDK mirror tests 通过。
- [x] CoreBox widget 可显示 archived/idle/missing continuation 的可理解 reason，插件 payload 不含 raw ContextPackage items。
- [x] focused CoreApp/plugin tests、plugin production build、CoreApp node/web typecheck、focused lint 和 task-slice `git diff --check` 通过。

## Constraints

- 不新增 SQLite schema/data migration，不修改旧 session 原文或状态。
- 不实现 session history browser、自动 archive、跨 owner/actor continuation 或真实 profile migration。
- `real-profile` 和 packaged evidence 若未采集必须保持 open，不以 unit/controlled 代替。
