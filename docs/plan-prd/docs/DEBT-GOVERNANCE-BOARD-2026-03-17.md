# Tuff 治理看板（Legacy / Compat / Size）

> 更新时间: 2026-05-11
> 数据来源（SoT）:
> - `docs/plan-prd/docs/compatibility-debt-registry.csv`
> - `scripts/legacy-boundary-allowlist.json`
> - `scripts/large-file-boundary-allowlist.json`

---

## 1) 快照结论（当前基线）

- 兼容债务清册总量：`36` 条
- 分域分布：`compat-file 5` / `core-app-migration-exception 3` / `size-growth-exception 28`
- Legacy/raw 边界：`legacy-keyword 0` / `raw-channel-send 0` / `legacy-transport-import 0` / `legacy-permission-import 0`
- 超长文件报告：`oversizedFiles=58` / `newOversizedFiles=5` / `grownOversizedFiles=15`
- 允许增长豁免（growthExceptions）：`28` 个
- 最大超长文件：`3659` 行（`apps/nexus/server/utils/tuffIntelligenceLabService.ts`）
- 主线门禁状态：`size:guard --report` 可生成报告且当前无过期债务；release strict 仍需继续清理新增/增长超长文件。

---

## 2) Owner 维度分布（registry）

| owner | 总数 | 主要构成 |
| --- | ---: | --- |
| `core-app` | 22 | compat-file(5), core-app-migration-exception(3), size-growth-exception(14) |
| `aiapp` | 6 | size-growth-exception(6) |
| `nexus` | 3 | size-growth-exception(3) |
| `packages-tuff-intelligence` | 2 | size-growth-exception(2) |
| `plugin-touch-translation` | 2 | size-growth-exception(2) |
| `packages-tuff-cli` | 1 | size-growth-exception(1) |

---

## 3) Ticket 维度（强跟踪项）

### 3.1 Compatibility Naming（必须追踪 file + registry + guard）

| owner | remaining files | 说明 |
| --- | ---: | --- |
| `core-app` | 5 | `startup-migrations.ts`、download migration 文件、`polyfills.ts`、renderer `MigrationProgress.vue` 仍作为迁移/运行时命名债务登记。 |

### 3.2 Growth Exceptions（必须追踪 file + ticket + CHANGES）

| owner | count | 重点清理方向 |
| --- | ---: | --- |
| `core-app` | 14 | `clipboard.ts`、`search-core.ts`、`plugin-module.ts`、`app-provider.ts` 等继续按 SRP 切片降低 cap。 |
| `aiapp` | 6 | AIGC completion、chat stream、tool gateway 与 admin channel 继续拆分。 |
| `nexus` | 3 | i18n locale 与 `authStore.ts` 拆分。 |
| `packages-tuff-intelligence` | 2 | `deepagent-engine.ts` 与 intelligence 类型拆分。 |
| `plugin-touch-translation` | 2 | 插件入口与翻译面板拆分。 |
| `packages-tuff-cli` | 1 | CLI 入口拆分。 |

---

## 4) 结构风险榜（当前报告口径）

| 指标 | 当前值 |
| --- | ---: |
| `oversizedFiles` | 58 |
| `newOversizedFiles` | 5 |
| `grownOversizedFiles` | 15 |
| `growthExceptions` | 28 |
| `expiredDebt` | 0 |
| `cleanupCandidates` | 0 |
| `invalidConfig` | 0 |

---

## 5) 执行口径（单一标准）

1. 新增兼容债务必须先入 `compatibility-debt-registry.csv`，且带 `owner + expires_version + test_case_id`。
2. `legacy-keyword` / `raw-channel-send` / legacy import 维度必须保持 `0`，不得通过 allowlist 扩容兜底。
3. `size:guard` 禁止自动抬升 baseline；超限仅能通过 `growthExceptions + ticket` 临时放行。
4. `growthExceptions` 变更必须同步 `CHANGES` 与 registry 对应条目。
5. 默认清退门槛维持 `v2.4.11`，兼容路径坚持“只减不增”。

---

## 6) 下一个清理窗口（建议）

1. `core-app`：继续清理剩余 `compat-file 5`，优先评估 download migration 命名与 `polyfills.ts` 的退场条件。
2. `core-app`：继续拆 `clipboard.ts` autopaste、`search-core.ts` 与 `app-provider.ts`，按行为等价切片降低 size cap。
3. `nexus`：拆分 `tuffIntelligenceLabService.ts`、locale 与 auth store 超长报告项。
4. `packages-utils`：retained raw definition 当前测试上限为 `265`，继续把符合 typed builder 结构的事件分批迁入 typed registry。
