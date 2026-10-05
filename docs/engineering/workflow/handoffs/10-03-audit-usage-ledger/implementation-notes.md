# Implementation notes — 用量账本

实现代理的工作记录（2026-10-03）。Trellis 注入未触发，按 dispatch 指示手动读取 prd / design / implement、父任务
design §0–§1.6 / §2.5 / §3.2 / §3.5、两份 research、定价任务 design + implementation-notes 与 7 份 spec。

## 基线（改动前，2026-10-03 06:45 PDT）

- `tsc --noEmit -p tsconfig.node.json --composite false`：exit 0，0 个 error TS。
- utils 契约测试 3 文件 67 例全绿；core-app 验证清单 12 文件 149 例全绿。

## 读代码发现、已定取舍

1. **Home 对话轮不能由 renderer 带 `caller`**：`providers/pi-cli-provider.ts` 的 `resolveHomeSessionContext`
   对 `metadata.surface === 'home-conversation'` 且带 `caller` 的请求抛 `PI_NATIVE_SESSION_CONTEXT_INVALID`
   （防插件冒充 Home 打开原生 Pi 会话，`pi-cli-provider.home-session.test.ts` 的 "plugin caller impersonating
   Home" 用例钉住）。按 design 在 `useHomeConversation.ts` 加 `caller` 会让 Pi 渠道的 Home 对话全部失败。
   改为：SDK 在 caller 缺省且 `metadata.surface === INTELLIGENCE_HOME_SURFACE` 时，把审计 / 配额用的调用方
   记为 `core.home.conversation`（不写回 metadata，provider 看不到）。插件请求的 caller 恒被宿主强制为
   `plugin:<name>`，到不了这条分支，不能借它冒充。开场白、会话标题不带 Home surface，照 design 在 renderer 带 caller。
2. **回填边界用 `cutoffId`**：标记 JSON 在 design 字段之外加 `cutoffId`（标记创建时 `MAX(id)`），回填只取
   `id <= cutoffId`。`intelligence_audit_logs.id` 是 AUTOINCREMENT，永不复用；标记在第一次 flush 的同一事务里、
   插入本批明细之前创建，所以此后的实时行 id 恒大于 `cutoffId`。纯时间边界在时钟回拨时会重复计数或漏计，id 边界没有这个问题。
   `cutoffMs`（= logger 构造时刻，即进程启动）照记，作诊断与文档字段。
3. **本地日分组不用 SQLite `localtime`**：回填按 `timestamp / 900000`（15 分钟 UTC 槽）分组，再在 JS 里用
   `localDayKey()` 归到本地日。现行时区偏移都是 15 分钟整数倍，槽不跨本地零点；避免依赖原生库是否跟随运行时
   `process.env.TZ` 变化（AC-B2 的测试在同一进程里切 TZ）。
4. **未落库增量的一致读**：`GlobalUsageDeltas` 按条目对象跟踪（`Map<entry, periodKeys>`），费用取条目上的
   `estimatedCost`（flush 准备阶段定价后即生效），提交后在**同一个写任务回调里**同步扣减并递增 `version`。
   读侧「记 version → 读库 → version 未变才合并快照」，变了就重读（最多 3 次）。
5. **`quotaCache` 原先不缓存「无配额」**（`getQuota` 查不到直接 return null）。九个新 caller 每次调用都会查库，
   按 B5 修：缓存 null，并用代际计数防止「读库期间 setQuota」被旧的 null 覆盖。
6. **审计行 `provider` 统一为选中渠道配置 id**（R-A4）后，下列既有断言按新契约更新（不是放宽）：
   `intelligence-sdk.test.ts` 的 fallback / stream 成功与失败审计 provider、`intelligence-stream-ledger` 与
   `intelligence-typed-transport` 两个真实库集成测试的 provider（及随之变化的费用锚点）。流式事件里给消费方的
   `provider` 不变，仍是 chunk 上报值。

## 进度

见 implement.md 清单；验收证据在完成后补到本文件末尾。
