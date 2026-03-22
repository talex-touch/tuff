# Talex Touch 治理看板（Legacy / Compat / Size）

> 更新时间: 2026-03-17  
> 数据来源（SoT）:  
> - `docs/plan-prd/docs/compatibility-debt-registry.csv`  
> - `scripts/legacy-boundary-allowlist.json`  
> - `scripts/large-file-boundary-allowlist.json`

---

## 1) 快照结论（当前基线）

- 兼容债务清册总量：`120` 条  
- 分域分布：`legacy-keyword 79` / `compat-file 26` / `raw-channel-send 13` / `size-growth-exception 2`  
- 超长文件基线（>=1200）：`46` 个  
- 允许增长豁免（growthExceptions）：`2` 个（全部 `expiresVersion=2.5.0`）
- 主线门禁状态（本次快照）：`pnpm quality:gate` 通过

---

## 2) Owner 维度分布（registry）

| owner | 总数 | 主要构成 |
| --- | ---: | --- |
| `core-app` | 46 | compat-file(10), legacy-keyword(36) |
| `packages-utils` | 36 | compat-file(3), legacy-keyword(21), raw-channel-send(12) |
| `pilot` | 15 | compat-file(5), legacy-keyword(9), size-growth-exception(1) |
| `nexus` | 11 | compat-file(3), legacy-keyword(8) |
| `packages-tuff-intelligence` | 4 | compat-file(2), legacy-keyword(1), size-growth-exception(1) |
| 其他 | 8 | tuffex / plugin / unplugin 等 |

---

## 3) Ticket 维度（强跟踪项）

### 3.1 Growth Exceptions（必须追踪 file + ticket + CHANGES）

| ticket | owner | file | cap(lines) | expiresVersion |
| --- | --- | --- | ---: | --- |
| `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` | `pilot` | `apps/pilot/server/api/aigc/executor.post.ts` | 1666 | 2.5.0 |
| `SIZE-GROWTH-2026-03-16-DEEPAGENT` | `packages-tuff-intelligence` | `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` | 1924 | 2.5.0 |

### 3.2 固定测试票据（策略项）

- `LEGACY-GUARD-KEYWORD`: 覆盖 `legacy-keyword` 全域  
- `LEGACY-GUARD-RAW-EVENT`: 覆盖 `raw-channel-send` 全域  
- `COMPAT-REGISTRY-NAMING`: 覆盖 `compat-file` 命名债务

---

## 4) 结构风险榜（超长文件 Top 10）

| lines | file |
| ---: | --- |
| 4898 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` |
| 3657 | `apps/nexus/server/utils/tuffIntelligenceLabService.ts` |
| 3627 | `apps/core-app/src/main/modules/plugin/plugin-module.ts` |
| 2821 | `apps/nexus/app/pages/docs/[...slug].vue` |
| 2783 | `packages/utils/transport/events/index.ts` |
| 2693 | `apps/nexus/i18n/locales/en.ts` |
| 2688 | `apps/core-app/src/main/modules/clipboard.ts` |
| 2678 | `apps/nexus/i18n/locales/zh.ts` |
| 2547 | `apps/core-app/src/main/modules/update/UpdateService.ts` |
| 2413 | `apps/nexus/server/utils/pluginsStore.ts` |

---

## 5) 执行口径（单一标准）

1. 新增兼容债务必须先入 `compatibility-debt-registry.csv`，且带 `owner + expires_version + test_case_id`。  
2. 所有新增 `legacy-keyword` / `raw-channel-send` 必须先更新 `legacy-boundary-allowlist.json`，否则门禁阻断。  
3. `size:guard` 禁止自动抬升 baseline；超限仅能通过 `growthExceptions + ticket` 临时放行。  
4. `growthExceptions` 变更必须同时更新 `CHANGES` 与 registry 对应条目。  
5. 默认清退门槛维持 `v2.5.0`，兼容路径坚持“只减不增”。

---

## 6) 下一个清理窗口（建议）

1. `pilot`：优先消化 `executor.post.ts` 的 growth exception 并完成 API entry/service 拆分。  
2. `packages-tuff-intelligence`：拆分 `deepagent-engine.ts`，清退 `SIZE-GROWTH-2026-03-16-DEEPAGENT`。  
3. `packages-utils`：继续压降 `raw-channel-send(12)`，优先 plugin sdk 高频通道。  
4. `core-app`：从 `file-provider / plugin-module / clipboard` 启动 SRP 拆分。
