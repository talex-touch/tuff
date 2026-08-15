# 执行计划 — TuffEx Anchor 延迟服务与组合动画

分四个阶段。每阶段结束时工作树可编译、门禁可独立跑、可单独 revert。
阶段之间不共享未完成状态，任何一个阶段被叫停都不会留下半成品 API。

---

## 阶段 0 — 基线固定（先做，不可跳）

在动任何代码前记录当前值，否则后面无法区分「新增回归」和「既有红项」。

- [ ] 0.1 `cd packages/tuffex && pnpm run build`（`audit:size` 读 `dist/`，必须先构建）
- [ ] 0.2 记录基线：
  ```bash
  cd packages/tuffex
  pnpm run test          2>&1 | tail -5   # 记录用例数
  pnpm run audit:size    2>&1 | tail -30  # 记录每项预算的当前红/绿
  pnpm run audit:exports 2>&1 | tail -5
  pnpm run typecheck     2>&1 | tail -5
  cd ../../apps/nexus && pnpm exec vitest run 2>&1 | tail -3   # 已知基线 200 文件 / 1109 用例
  ```
- [ ] 0.3 把上述输出写进本任务目录的 `research/baseline.md`。

> CSS 预算自 2026-06 起既有红项，**只比较增量**，不要求转绿。

**回滚点 A**：此处无代码改动。

---

## 阶段 1 — 延迟服务本体（不接任何组件）

纯新增，不触碰现有组件，因此不可能造成回归。

- [ ] 1.1 新建 `packages/tuffex/packages/utils/anchor-delay.ts`
  - `AnchorDelayLayer` / `AnchorDelayPolicy` / `AnchorNode` / `AnchorDelayHandle` 类型
  - `ANCHOR_DELAY_PRESETS`，取值严格等于 design.md §2 的表（hint 200/120/300、menu 120/100/0、dialog 0/0/0）
  - `createAnchorDelayService()`：注册表、抢占、预热、suppress 矩阵
  - `TX_ANCHOR_DELAY_KEY` / `provideAnchorDelayService(app)` / `useAnchorDelayService()` + fallback 实例
  - `configureAnchorDelay(patch)`
  - 全部定时器与注册表操作以 `typeof window !== 'undefined'` 兜底
- [ ] 1.2 在 `packages/utils/index.ts` 增加 `export * from './anchor-delay'`
- [ ] 1.3 在 `components/src/index.ts` 的 `install()` 里调用 `provideAnchorDelayService(app)`
      （紧邻现有的 `provideZIndexAllocator(app)`）
- [ ] 1.4 写 `packages/utils/__tests__/anchor-delay.test.ts`，逐条对应 PRD 验收：
  - AC3 同层抢占：A 打开 → B 打开 → 断言 A 在**小于** A 的 closeDelay 的时间点已关闭
  - AC4 祖先豁免（两条）：子节点打开不关父节点；跨层的子节点（面板内 hint）不关父 menu
  - AC5 预热：热窗口内 openDelay 为 0；`skipDelay` 过期后恢复 200
  - AC6 跨层：menu 打开 → 既有 hint 立即关闭；期间 `scheduleOpen('hint')` 不生效
  - SSR：`createAnchorDelayService()` 两个实例互不可见（防跨请求泄漏）
  - 使用 vitest 假定时器，断言的是**调度时机**而非真实等待

**门禁**：`pnpm -C packages/tuffex run test` + `typecheck` + `lint`
**回滚点 B**：`git revert` 本阶段提交即可，无消费方依赖。

---

## 阶段 2 — 组合动画（仍不接服务）

与阶段 1 正交，可并行审阅。

- [ ] 2.1 `base-anchor/src/types.ts`：`BaseAnchorAnimationOptions` 增加 `closeType?` 与 `exit?`
- [ ] 2.2 `base-anchor-motion.ts`：
  - `resolvedAnimation` 由「`isExpand` 单开关切表」改为**按阶段查表**：
    open 用 `type` 的表，close 用 `closeType` 的表
  - `animateClose` 的类型分发由 `type` 改为 `closeType`
  - `usesLiquidMotion` / `usesBeadMotion` 同时考虑两个阶段
  - 液态约束：任一阶段为 `drip`/`bead` 则两阶段必须同类，否则 dev `console.warn` 并把
    `closeType` 回落为 `type`
- [ ] 2.3 测试：
  - **等价性**（最重要）：不传 `closeType`/`exit` 时，`resolvedAnimation` 的每个字段与改动前逐字段相等。
    先对当前实现快照一份期望值再改，避免自证。
  - `closeType` 生效：`{ type: 'boom', closeType: 'expand' }` 下 close 分支走 expand 的表
  - `exit.scale` 覆盖共享 `scale`，未给时回落
  - 液态混搭被拒绝并告警

**门禁**：同上 + 目视确认 `expand` 默认观感无变化（BaseAnchor demo 页）
**回滚点 C**：独立可 revert。

---

## 阶段 3 — 组件接入

此处才产生对外可观测的行为变化，风险最高。

- [ ] 3.1 `TxBaseAnchor`：新增 `layer` / `openDelay` / `closeDelay` / `delayPolicy` props；
      `inject` 父节点 → `provide` 自身；调用 `useAnchorDelay`
- [ ] 3.2 `TxTooltip`：删除自持的 `openTimer/closeTimer/clearTimers/scheduleOpen/scheduleClose`，
      改为透传 `layer: 'hint'` + 现有 props；**prop 默认值由字面量 200/120 改为 `undefined`**，由预设兜底
- [ ] 3.3 `TxPopover`：同上，`layer: 'menu'`，默认值 120/100 → `undefined`
- [ ] 3.4 `TxDropdownMenu`：确认经 `TxPopover` 已继承，必要时透传 `layer`
- [ ] 3.5 回归测试：`tooltip` / `popover` / `dropdown-menu` 三个 `__tests__` 全绿；
      补一条「两个 tooltip 互斥」的组件级测试（PRD 里用户提的原始场景）

**门禁**：tuffex 全量 test + typecheck + lint + build + `audit:size`/`audit:exports`（与阶段 0 基线比增量）
**回滚点 D**：本阶段是行为变更的唯一来源，revert 即恢复原状。

---

## 阶段 4 — 下游与文档

- [ ] 4.1 `apps/nexus`：删除 `LanguageToggle.vue` / `DarkToggle.vue` 里的 `CLOSE_DELAY = 600`
      及其定时器，改为 `TxDropdownMenu` 上的 delay 配置（AC9）
- [ ] 4.2 nexus 头部两个 toggle 接入目标组合动画
      `{ type: 'boom', scale: 0.94, blur: 12, closeType: 'expand' }`（AC8）
- [ ] 4.3 nexus 文档同步：`base-anchor` / `tooltip` / `popover` / `dropdown-menu` 四篇，
      新增 API 说明 + 一个可交互的组合动画 demo；**zh/en 段数必须相等**
- [ ] 4.4 demo 若新增 `.vue`，同步 `demo-registry.ts`，避免产生孤儿 demo

**门禁**：
```bash
cd apps/nexus && pnpm exec vitest run          # 需 ≥ 200 文件 / 1109 用例全过
pnpm exec eslint <改动文件>
pnpm run check:mdc-fences                       # 内容文件语法守卫
cd ../.. && pnpm -C apps/core-app run typecheck  # tuffex 改动的第三个下游
```

---

## 全局注意事项

- **CoreApp 的 lint 配置与根配置相反**（尾逗号等）。若改动波及 `apps/core-app`，用包内配置，
  且只判增量，绝不整文件 `--fix`。
- **本仓库有并发 agent 写入**。验证某文件的 HEAD 版本时用 `git show 'HEAD:path' > /tmp/x`，
  **不要** stash / checkout / restore。ref 要整体单引号，否则 zsh 的 `:a` 修饰符会吃掉路径。
- `rg` 的 `-r` 是 `--replace`，标志永远分开写（`rg -n -r` ≠ `rg -rn`）。
- 每阶段结束提交一次，提交信息标明阶段号，便于按回滚点定位。

## 待办前置

PRD 的 Q1（closeDelay 是否按 `interactive` 分叉）在**阶段 1.1 写预设表之前**需要答复。
未答复则按 design.md 的预留实现（`hint` 与 `hintInteractive` 两条，默认只启用前者），
接通只需一行，不阻塞。
