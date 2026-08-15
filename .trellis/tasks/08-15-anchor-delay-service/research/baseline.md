# 门禁基线 — 2026-08-15 03:49

阶段 0 记录。后续所有「是否新增回归」的判断以此为唯一比对依据。

采集时的工作树状态：本任务尚未写任何代码。

> **⚠ 更正（同日稍后发现）：下面那句「tuffex 基线干净」是错的。**
>
> 初次记录时写了「tuffex 侧未被当日改动触及，故基线干净」。实测推翻：
> `base-anchor` 与 `base-surface` 存在**大量他人在途的未提交改动**——
> 9 个文件、**796 增 / 40 删**，其中 `base-anchor-motion.ts` 独占 **+394 行**，
> 两个测试文件 +235 / +58。
>
> 决定性证据：`git show 'HEAD:...base-anchor-motion.ts'` 中**根本没有 `EXPAND_DEFAULTS`**，
> 而工作树里有 —— 也就是说整个 `expand` 动画类型（当前的默认动效）都还没进 HEAD，
> 且仍在被调（工作树注释写着 `spring(10, 0.6)` / 起始 0.88，与更早记录的 0.72 / 0.95 不同）。
>
> **因此下表的数字是「HEAD + 他人在途改动」的混合基线，不是 HEAD 基线。**
> 特别是 `base-anchor-motion.js` 的 26.4 KiB 里含那 +394 行。
> 用它判断本任务的体积增量仍然有效（同一棵树前后比较），
> 但**不能**用它对照 HEAD 或对照其他分支。

## packages/tuffex

先 `pnpm run build`（EXIT=0），`audit:size` 读 `dist/`，必须先构建。

| 门禁 | 结果 |
|---|---|
| `pnpm run test` | **155 files / 1284 tests 全过** |
| `pnpm run audit:size` | **绿** — `package size and Core App root import budgets are within limits` |
| `pnpm run audit:exports` | 绿 — `package exports are backed by dist files` |
| `pnpm run audit:types` | 绿 — `package subpath declarations compile in an external project` |
| `pnpm run audit:readme` | 绿 — `README component inventory matches components.ts (126 modules, both languages)` |
| `pnpm run typecheck` | 绿 — 无输出 |

### 体积重点观察项

`audit:size` 报出的最大产物**正是本任务要改的文件**：

```
26.4 KiB  dist/es/base-anchor/src/base-anchor-motion.js   ← 阶段 2 要在此加 closeType / exit
22.3 KiB  dist/es/flip-overlay/src/TxFlipOverlay.vue.js
21.9 KiB  dist/es/components.js
20.5 KiB  dist/es/code-editor/src/TxCodeEditorRuntime2.vue.js
18.9 KiB  dist/es/empty-state/src/TxEmptyState2.vue.js
18.6 KiB  dist/es/picker/src/TxPicker2.vue.js
```

阶段 2 结束后必须重新 build + `audit:size`，确认 `base-anchor-motion.js` 的增长没有把它顶出预算。
按阶段查表会引入一定重复，若逼近上限，优先把 open/close 的默认表合并成一个按 type 索引的字典，
而不是放宽预算。

### 与既有记忆的冲突（已纠正）

先前记录的「tuffex CSS 预算自 ~2026-06 起长期红，只能比增量」**与实测不符**：
本次 `audit:size` 完全通过。因此本任务采用**严格标准 —— 门禁必须保持全绿**，不接受「既有红项」豁免。

## apps/nexus

| 门禁 | 结果 |
|---|---|
| `pnpm exec vitest run` | **200 files / 1109 tests 全过**（含当日未提交改动） |

## 复现命令

```bash
cd packages/tuffex
pnpm run build && pnpm run test && pnpm run audit:size \
  && pnpm run audit:exports && pnpm run audit:types \
  && pnpm run audit:readme && pnpm run typecheck

cd ../../apps/nexus && pnpm exec vitest run
cd ../core-app && npm run typecheck
```

> `apps/core-app` 的 typecheck 未在基线中采集 —— tuffex 改动落地前它不受影响，
> 阶段 3 结束后首次采集即为其比对点。
