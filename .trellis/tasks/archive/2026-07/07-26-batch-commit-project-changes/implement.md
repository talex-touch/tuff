# 执行计划

## 1. 基线、实现与审查

- [x] 复核 `research/commit-inventory.md` 与当前 `git diff`，覆盖 G01-G19 全部业务文件/hunk。
- [x] 在 G03、G07、G08、G13、G14、G16 边界内修复 Check Agent 确认的行为或规范缺陷。
- [x] 复核新增测试的行为有效性，不以源码字符串断言替代关键交互/路由测试。
- [x] 复核既有 typecheck 与 visual-smoke 失败归因；排除并发构建污染。
- [x] 输出最终审查、归属和 submit/defer 结论：`research/check-results.md`。

## 2. 分组结论

### 可提交

- [x] G01 startup analytics
- [x] G02 chunked app addition transactions（用户明确接受跨 chunk 部分成功；chunk 内 file/extension 原子，下次扫描补齐）
- [x] G03 app index warmup lifecycle
- [x] G04 streamed search onboarding gate
- [x] G05 indexing task state schema
- [x] G06 storage LRU eviction race
- [x] G07 onboarding file permission flow
- [x] G08 durable onboarding completion
- [x] G09 rerun onboarding guide
- [x] G10 compact settings email
- [x] G11 stale provider translations
- [x] G13 docs route/locale cache ownership
- [x] G14 docs reading UI
- [x] G15 TxFloating lifecycle
- [x] G16 Instant Preview layout/i18n
- [x] G17 renderer MessagePort lifecycle
- [x] G18 core-app Vue direct dependency
- [x] G19 touch-intelligence Vue catalog

### 审查后纳入

- [x] G02 分块写入语义已获用户明确接受，并补充超过 50 条拆分及后续 chunk 失败保留已完成 chunk 的测试。
- [x] G12 自动激活策略及长文档全部 demo 保持挂载、JS heap 约增加 7.5 MB 的取舍已获用户明确接受并提交。

## 3. 质量门禁

- [x] `pnpm install --frozen-lockfile --ignore-scripts`
- [x] `pnpm lint:changed`；全部 untracked TS/Vue 文件另行 package-scoped ESLint 通过
- [x] `git diff --check`
- [x] `pnpm plugins:validate`：24/24
- [x] AppProvider：62/62
- [x] StorageModule：3/3；Storage LRU：5/5
- [x] CoreBox IPC/manager：14/14
- [x] Indexing task state：15/15
- [x] Startup analytics：6/6；identity presentation：3/3
- [x] onboarding/permission focused 与挂载交互 tests
- [x] Utils MessagePort/stream/bridge focused suites：12/12
- [x] TuffEx Floating：12/12；TuffEx typecheck
- [x] Nexus cache/demo/Instant Preview 与 selected docs assertions
- [x] CoreApp web typecheck（直接调用 lockfile `vue-tsc@3.3.7`）
- [x] 浏览器几何：Instant Preview 1440x900 / 390x844；Docs Hero en desktop / zh mobile

已归因、非本次新增：

- CoreApp node typecheck 仅剩未修改 `plugin.ts:167,169,171`。
- Nexus typecheck 串行复核后仅剩未修改 `port-handoff.ts:114,119,153`。
- `visual:smoke:tuffex` 被未修改且缺失的 `packages/tuffex/scripts/audit-cdp-client.mjs` 阻塞。
- 标准 CoreApp `typecheck:web` wrapper 受本机陈旧 `vue-tsc` symlink 阻塞；锁定 3.3.7 直接 typecheck 通过。

## 4. 提交执行

- [x] 形成最终提交顺序；见 `research/check-results.md`，G02 后续经用户明确决策纳入。
- [x] 获得用户一次性授权后，逐组暂存并复核共享文件 hunk。
- [x] 每次提交前运行 staged diff stat/check/full review。
- [x] 使用英文 Conventional Commit 消息完成 18 个本地提交；未 amend、未 push。
- [x] 最终复核 `git log --oneline` 与 `git status --short --branch`。

最终 staging 为空；首轮完成 18 个本地提交。G02 在后续 beta.23 发布请求中获用户明确接受，补齐契约和 focused tests 后作为独立提交纳入。

## Rollback Points

- G02 已获产品/架构取舍确认：每个 chunk 内保持原子，后续 chunk 失败时允许保留已完成 chunk，并由下次扫描补齐。
- G12 已获产品/性能取舍确认；若后续需要限制累积挂载，应作为独立性能任务处理。
- 共享文件 staged diff 出现其他组内容时停止提交并重新构造 patch。
