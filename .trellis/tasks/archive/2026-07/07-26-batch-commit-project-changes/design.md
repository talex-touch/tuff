# 分批提交设计

## Boundaries

本任务不引入新架构。它把现有工作区差异映射为独立提交单元，并只在现有单元内修复验证暴露的问题。候选单元、文件归属、风险和最小验证以 `research/commit-inventory.md` 为基线。

## Commit Model

- 以功能契约为提交边界，不以目录或单文件为边界。
- 实现与直接测试同批；共享依赖声明先于消费者提交。
- 推荐顺序：依赖声明 -> CoreApp main/storage/search -> CoreApp onboarding/settings -> shared transport -> TuffEx primitive -> Nexus consumer/docs。
- 19 个候选组保持独立，除非实际 diff 证明两个组无法安全拆分；任何合并都必须在最终提交计划中说明。

## Hunk Ownership

以下共享文件必须按 hunk 归属暂存：

- `app-provider.ts`：扫描写入分块与索引预热健康检查分开。
- CoreApp 中英文 locale：权限跳过、重新运行引导、旧 provider 文案清理分开。
- Nexus docs page 与性能测试：demo 激活、客户端缓存、阅读版式分开。
- Nexus locale：demo 文案删除与 outline 文案分开。
- `pnpm-lock.yaml`：core-app importer 与 touch-intelligence importer 分开。

暂存采用可审计方式：先清空暂存区状态，按完整文件或精确 patch 暂存，随后执行 `git diff --cached --check`、`git diff --cached --stat` 和完整 staged diff 复核。不得使用整文件暂存覆盖共享 hunk 边界。

## Validation Gate

- 每个候选组先运行清单中的 focused tests/typecheck。
- 共享基础设施或全局视觉行为组执行扩展测试；验证失败时只在该组内最小修复。
- 已确认高风险组重点闭环：Storage LRU 并发与 force eviction、onboarding 持久化失败、docs demo 自动激活策略、TxFloating 全局视觉语义、Nexus docs 导航与视觉验收。
- G02 采用显式的 bounded-chunk 事务语义：每个 chunk 内文件行/扩展行原子，后续 chunk 失败保留已完成 chunk，下次幂等扫描补齐；focused tests 必须覆盖超过 chunk 上限和中途失败。
- 无法在当前边界内闭环的组不提交，保留在工作区并报告。
- 所有组处理后执行跨包 typecheck、changed lint、frozen lockfile 校验与 `git diff --check`。

## Rollback And Safety

- 每个业务提交可独立 `git revert`；不使用 amend、rebase 或历史重写。
- 不推送远端。
- 提交前若 staged diff 出现其他组内容，立即取消该批暂存并重新构造，不改动工作区内容。
- Trellis 任务文件始终排除在业务提交之外。

## Trade-offs

- 19 个提交数量较多，但共享文件同时承载多个行为，较细粒度能保证 review 和回滚准确。
- 最小修复门禁可能增加少量测试/实现差异；它优先保证历史中没有已知失败，而不是追求一次性清空工作区。
- 源码字符串测试只能证明结构契约，不能替代浏览器或 Electron 交互验证；最终报告必须区分自动化证据与未执行的人工证据。
