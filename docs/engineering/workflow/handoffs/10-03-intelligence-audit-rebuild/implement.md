# Implement — 智能审计页按洞察页 shell 重做（父任务）

父任务本身不写业务代码，只做三件事：按顺序启动子任务、在子任务之间做集成复核、做最终验收（`prd.md` AC-1 至 AC-23）。每个子任务的细节清单在各自的 `implement.md` 里。

## 0. 开工前（`task.py start` 之前）

- [ ] 老板评审 `prd.md`、`design.md` 与本文件，并回答 `prd.md` 里唯一的 Open Question：在哪里实现、Git 谁来做。
- [ ] 与协调方确认分支收敛已完成（PR #2041 等），工作区可以开始写入。
- [ ] 兄弟任务 `10-03-intelligence-settings-revamp` 的侧栏顺序验收追加「/ 记忆」（D5）。由老板或该任务会话改，本任务不写它的文件。
- [ ] 约定与兄弟任务的先后：双方都会改 `categories.ts`、`router.ts`、`zh-CN.json`、`en-US.json`、`SettingIntelligencePage.vue`。后落地的一方以先落地的结果为基线，按 D5 排好侧栏。
- [ ] `task.py start` 某个子任务时，补齐 `task.json` 的 `meta.blocker / meta.evidence / meta.nextAction`。缺了会让 Documentation Quality 变红（DOC-TASK-META）。

## 1. 执行顺序

```
第 1 波（互不相交，可并行）
  A. 10-03-modelsdev-pricing          主进程 ai/pricing/**（新目录）+ intelligence-audit-logger.ts 的费用函数
  D. 10-03-insights-shell-kit         renderer components/settings/insights/** + views/base/VoiceInsights.vue
  F. 10-03-intelligence-memory-page   renderer views/base/intelligence/IntelligenceMemoryPage.vue + components/intelligence/memory/**
                                      + categories.ts / router.ts / uno.config.ts / 语言包（记忆相关键）
第 2 波（A 合入后）
  B. 10-03-audit-usage-ledger         主进程 ai/intelligence-sdk.ts、intelligence-audit-logger.ts、usage-ledger/**、
                                      packages/utils 的 intelligence domain + plugin facade、各内置调用点
第 3 波（B 合入后）
  C. 10-03-intelligence-usage-limits  主进程 quota-manager / sdk 执行点 / normalizer + 共享错误码 + 6 个 renderer 分类器 + 后台降级
第 4 波（B、C、D 合入后；A 已在第 1 波合入）
  E. 10-03-audit-insights-page        renderer 审计页、components/intelligence/audit/**、语言包（intelligenceAudit.*）
```

排序理由：

- 先做 A：B 的历史回填和写入费用都要用新定价（`design.md` §1.3、§2.5），不然回填会按旧默认价算一次、之后无法纠正。
- A 与 B 都改 `intelligence-audit-logger.ts`，所以 B 必须串行在 A 之后。A 只替换费用函数，B 改写入与 flush。
- C 依赖 B 的全局桶与未落库增量。E 依赖 B、C 的读接口和 D 的组件。
- D、F 只碰 renderer，且文件集合不相交，可以和 A 并行。
- 语言包冲突：
  - F 与 E 都改 `zh-CN.json` / `en-US.json`，F 在第 1 波，E 在第 4 波，天然串行；
  - D 原则上不新增文案，若要加，也在第 1 波内与 F 串行写；
  - C 在第 3 波，改错误文案键。

## 2. 并行派发时的规矩

依据 `.trellis/spec/guides/multi-session-collab-guide.md`。

- 契约先落地：B 开工的第一步，就是把 `design.md` §1.5 / §3.2 / §3.5 的类型写进 `packages/utils/transport/sdk/domains/intelligence.ts`；C、E 按这份类型实现，不各自再定义。
- 每个派发的 prompt 写明文件归属边界，并把其他会话正在改的文件列为禁止触碰。以开工时的 `git status` 为准，至少包括：
  - 兄弟任务的 `SettingSkillsMcp.vue`、Nexus 渠道相关文件；
  - `ShellSidebar.vue`、`ShellUpdateNotice.vue`。
- 类型检查与 lint 只按「本子任务范围 0 新增错误」判定，不要求全仓全绿。
- 每个派发 prompt 首行写 `Active task: <子任务路径>`。

## 3. 每个子任务的完成门禁（trellis-check 前自检）

```bash
pnpm -C "apps/core-app" run typecheck:node      # 主进程子任务
pnpm -C "apps/core-app" run typecheck:web       # renderer 子任务
pnpm -C "apps/core-app" exec vitest run <本子任务新增/改动的测试文件>
pnpm -C "packages/utils" exec vitest run __tests__/plugin-facing-events.test.ts __tests__/intelligence-client-hard-cut.test.ts   # 动了 SDK 时
pnpm check coreapp-ui-contract                  # renderer 子任务
corepack pnpm privacy:inventory:verify          # B
git diff --check
```

- lint 按 core-app 包内配置判 delta，绝不整文件 `--fix`（`coreapp-lint-config-vs-root` 经验）。
- 有 UI 的子任务（D、E、F）必须在真实 dev 实例里截图验证：
  - 先确认 CDP 实例是自己起的；
  - 页面的空态、加载态、错误态各截一张。

## 4. 集成复核（全部子任务完成后，父任务执行）

- [ ] 逐条核对 `prd.md` AC-1 至 AC-23，每条附证据：测试名或截图路径。
- [ ] 全新 profile 冒烟（隔离 dev 实例）：
  - 首启审计默认开启；
  - 发一次 Home 对话：审计页 2 秒内计数 +1，约 30 秒内记录抽屉出现明细，caller 为 `core.home.conversation`。
- [ ] 上限闭环：设「每日 2 次请求」，第 3 次 Home 对话出现「已达到你设置的上限」，且不是 Nexus 积分文案；审计页显示已到顶与重置时间；清除上限后恢复。
- [ ] 0 定价闭环：用一个 Ollama 或未收录模型发调用，三处提示都列出该模型（AC-16）。
- [ ] 语音页回归（AC-18）与记忆子页侧栏顺序（AC-19、D5）。
- [ ] spec / inventory 更新到位（AC-21）：
  - `pi-provider-contracts.md`、`privacy-data-lifecycle.md`；
  - main-process 新契约；
  - `sensitive-data-inventory.json`。

## 5. 回滚点

| 子任务 | 回滚方式 | 残留 |
|---|---|---|
| A 定价 | revert；费用回到 `MODEL_COSTS` | `system_config` 的 `intelligence.pricing.models-dev.catalog` / `.since` 两行（无害） |
| B 账本 | revert；审计关闭时重新不计数 | `__global__` 计数行、回填标记（旧代码不读） |
| C 上限 | revert；不再检查全局上限 | 配额保留行（`getAllQuotas` 会重新列出，renderer 无界面，无害） |
| D shell kit | revert；语音页回到私有样式 | 无 |
| E 审计页 | revert；旧页面回来（旧组件随 revert 恢复） | 无 |
| F 记忆页 | revert；记忆复核回到审计页 | 无 |

- E 依赖 B、C、D 的接口，单独 revert B / C 前先 revert E。
- `DEFAULT_GLOBAL_CONFIG.enableAudit` 回滚只影响之后的新装用户。

## 6. 提交

- 协调方要求共享目录的 Git 操作留给他（2026-10-03 收敛通知）。子任务完成后只汇报改动文件清单与验证证据，不自行 commit / switch / stash。
- 若老板改为在独立 worktree 实现，再按 Trellis 3.4 正常提交。

## 7. 暂停与迁移（2026-10-03）

- **暂停原因**：仓库正从 Trellis 迁到 Comet Native。迁移 change `trellis-to-comet-native`（`docs/comet/changes/trellis-to-comet-native/`）的写入守卫只在当前 change 处于 Build 时放行实现写入，`.gitignore` 把 `/.trellis/` 标为退役。老板决定：等迁移归档后，把本计划转成 Comet Native 的 Supervisor change 再继续。
- **已落盘**：
  - 共享组件子任务：实现代理自报完成，`components/settings/insights/**` + `VoiceInsights.vue`，证据在 `10-03-insights-shell-kit/evidence/`，尚未独立复核。
  - 定价子任务：只落了 `pricing/pricing-provider-map.ts` 与夹具，完整目录模块草稿在 `10-03-modelsdev-pricing/drafts/`。
- **恢复办法**：按迁移 brief 的规则，读本目录与各子任务的产物（13 条决定、需求、验收、设计、调研），重新确认范围后由 Native 新建独立 change；6 个子任务照旧，作为 Supervisor 子任务。
- **已知环境问题**：本机 `mise exec -- comet` 因 `pnpm@11.24.0` 的 aqua 资产 404 无法运行；另一会话改了 `scripts/dev-electron-wrapper.mjs`（未提交，引用未导出的 `tuff-native/translation`），工作区的 dev wrapper 启动即报错。共享组件代理当时改用 HEAD 版 wrapper 起实例。
