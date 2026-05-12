# Tuff 治理执行清单（并行工作包）

> 更新时间: 2026-05-11
> 目标版本: `v2.4.11`（兼容债务清退门槛）
> 适用范围: `core-app / nexus / pilot / packages / plugins`（主线）

---

## 1) 当前状态（可执行口径）

- `compatibility-debt-registry.csv`: `36` 条
- `compat-file`: `5` 条
- `core-app-migration-exception`: `3` 条
- `size-growth-exception`: `28` 条
- Legacy/raw 边界：`legacy-keyword 0` / `raw-channel-send 0` / `legacy-transport-import 0` / `legacy-permission-import 0`
- Retained raw definitions：测试扫描上限 `<=264`
- `size` 报告：`oversizedFiles=58`、`newOversizedFiles=5`、`grownOversizedFiles=15`

---

## 2) 并行任务包（Owner + Ticket + 验收）

| WP | owner | 目标文件 / 域 | 关键动作 | 票据 | 状态 | 验收命令 |
| --- | --- | --- | --- | --- | --- | --- |
| A | `core-app` | remaining `compat-file 5` | 逐个确认迁移窗口后执行物理命名 hard-cut 或退场 | `COMPAT-REGISTRY-NAMING` | 进行中 | `pnpm compat:registry:guard` |
| B | `core-app` | `clipboard.ts / search-core.ts / app-provider.ts` | 按 SRP 切片迁出 autopaste、路由/召回、provider source 责任 | size-growth tickets | 进行中 | `node "scripts/check-large-file-boundaries.mjs" --report` |
| C | `packages-utils` | retained raw definitions `<=264` | 将符合 typed builder 结构的事件分批迁入 typed registry | transport boundary tests | 进行中 | `pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"` |
| D | `nexus` | `tuffIntelligenceLabService.ts / locales / authStore.ts` | 拆分 service、locale chunk 与 auth storage responsibility | size-growth tickets | 待开始 | `node "scripts/check-large-file-boundaries.mjs" --report` |
| E | `docs` | 治理文档矩阵 | 每次清退同步 `CHANGES + TODO/README/Quality Baseline + registry` | docs governance | 持续 | `node "scripts/check-doc-governance.mjs" --strict true --json` |

---

## 3) 本轮已执行技术动作（对应 1+2）

### 3.1 Compat 文件误伤清理

- `compat-file` 扫描中 `compat`、`shim/shims` 改为独立命名段匹配。
- `shim/shims` 排除 declaration-only `.d.ts`。
- 移除 `ShimmerText.vue`、declaration-only `shims*.d.ts` 与 `langchain-openai-compatible-provider.ts` 误伤清册项。

### 3.2 Download migration typed push events

- `DownloadEvents.migration.progress/result` 已进入 typed event registry。
- `MigrationProgress.vue` 移除局部 raw event definition。
- `retainedRawEventDefinitions` 上限从 `266` 收紧到 `264`。

### 3.3 sdkapi 与 Pilot compat 文件命名 hard-cut

- `apps/core-app/src/main/modules/plugin/sdk-compat.ts` 重命名为 `sdkapi-hard-cut-gate.ts`。
- `getPluginSdkCompatibilityGate()` / `PluginSdkCompatibilityGate` 重命名为 `getPluginSdkHardCutGate()` / `PluginSdkHardCutGate`。
- `apps/pilot/server/utils/pilot-compat-aigc.ts` 重命名为 `pilot-aigc-service.ts`。
- `apps/pilot/server/utils/pilot-compat-payment.ts` 重命名为 `pilot-payment-service.ts`。
- `apps/pilot/server/utils/pilot-compat-seeds.ts` 重命名为 `pilot-system-seeds.ts`。
- 对应 registry 4 条 `compat-file` 清退，当前 `compat-file=5`。

### 3.4 Tuffex FlipOverlay size exception 清退

- `TxFlipOverlay.vue` 的 stack registry / shared global mask 逻辑迁出到 `flip-overlay-stack.ts`。
- `TxFlipOverlay.vue` 从 `1344` 行降到 `1194` 行，低于 `1200` 行阈值。
- 清退 `SIZE-GROWTH-2026-05-08-TUFFEX-FLIP-OVERLAY` 的 allowlist 与 registry 条目，当前 `size-growth-exception=28`。

---

## 4) 执行顺序（非分阶段，按包并行）

1. 每个工作包先提交可编译的最小行为等价切片。
2. 每次清退前先确认 registry / allowlist / test 边界，避免新增兼容壳兜底。
3. ticket 清退条件满足后，同步删除：
   - `growthExceptions` 条目
   - registry 对应 `size-growth-exception` 或 `compat-file` 行
   - `CHANGES` 中增加清退完成记录

---

## 5) 风险与止损

1. 若拆分引入行为偏移：回到最小切片边界修复，不恢复 legacy 能力面。
2. 若 `legacy-keyword` 或 `raw-channel-send` 新增：先撤回新增点，再补迁移方案，不走 allowlist 扩容兜底。
3. 若 `size` 压降不足：继续按责任边界拆分，不新增 growth exception，除非有独立 ticket、owner 与过期版本。
