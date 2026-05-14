# 超长文件拆分计划（2026-05-14）

> 状态: 拆分计划 / 待按普通重构任务执行  
> 范围: 当前仍高于 1200 行的高风险候选文件  
> 说明: 本文只给出可执行拆分计划，不修改运行时代码；真实拆分需按文件 ownership 分批实施，并逐批补定向测试。

## 当前快照

本轮只读复核命令：

```bash
wc -l "apps/core-app/src/main/modules/clipboard.ts" "apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts" "apps/core-app/src/main/modules/plugin/plugin-module.ts"
find "apps/core-app/src/main" "apps/core-app/src/renderer/src" "apps/nexus/app" "apps/nexus/server" "packages" -type f \( -name "*.ts" -o -name "*.vue" \) -print0 | xargs -0 wc -l | sort -nr | head -40
```

关键结论：

- `clipboard.ts` 已降到 `1146` 行，低于 1200 阈值，不再作为本轮拆分候选。
- 仍需拆分计划覆盖的高风险候选集中在 CoreApp 搜索、插件、Provider、Nexus 服务与少量共享类型大文件。
- `growthExceptions` 的历史 guard 已退场到文档清册；当前执行方式按普通重构任务分批推进，不通过自动抬高 baseline 兜底。

## 优先级计划

| 优先级 | 文件 | 当前行数 | 拆分方向 | 最小验证 |
| --- | --- | ---: | --- | --- |
| P0 | `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3793 | 拆出 runtime repair、surface wiring、plugin registry sync、lifecycle orchestration；主文件只保留模块生命周期与组合根。 | `plugin-loaders.test.ts`、`plugin-preflight-helper.test.ts`、`plugin-installer.test.ts`、`install-queue.test.ts`，再补 plugin-module focused test。 |
| P0 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 3812 | 拆出 scan scheduler、index runtime、watcher integration、thumbnail/icon adapter、diagnostics/status builder；保留 provider facade。 | `file-provider-startup.test.ts`、`file-provider-watch-service.test.ts`、`file-provider-index-runtime-service.test.ts`、Everything fallback 相关回归。 |
| P0 | `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 3384 | 继续拆出 Windows source scanner、managed entries、launch command builder、diagnostic evidence mapper；保留搜索/执行 facade。 | `app-provider.test.ts`、App Index diagnostic verifier、Windows acceptance manifest verifier focused tests。 |
| P1 | `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 2488 | 拆出 provider orchestration、result merge/ranking、cache result handling、telemetry/session summary；主文件只保留 query pipeline。 | `search-core.regression-baseline.test.ts`、recommendation/search trace focused tests。 |
| P1 | `apps/core-app/src/main/modules/plugin/plugin.ts` | 2295 | 拆出 SDK bridge、surface events、permission/capability adapter、runtime error mapper；保持 public plugin runtime 合同不变。 | Plugin SDK lifecycle / channel / permission focused tests。 |
| P1 | `apps/core-app/src/main/modules/update/UpdateService.ts` / `update-system.ts` | 2512 / 1612 | 继续把 asset matching、install handoff、diagnostic evidence、cache/hydration 分离为纯 helper 与 runtime service。 | update diagnostic verifier、renderer update runtime tests、Windows acceptance update case tests。 |
| P2 | `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 3408 | 拆出 tool execution、provider routing、usage ledger、health check writer 与 serialization helper。 | Nexus intelligence lab service focused tests + provider registry API tests。 |
| P2 | `apps/nexus/server/utils/authStore.ts` | 2537 | 拆出 device auth risk policy、audit store、trusted device mapper、login-history mapper。 | `device-auth-risk.test.ts`、device auth API tests。 |
| P2 | `apps/nexus/app/pages/docs/[...slug].vue` | 2812 | 把 document fetch state、assistant panel state、TOC/scroll behavior 与 render helpers 拆成 composables。 | Nexus docs page typecheck + targeted component smoke。 |
| P2 | `packages/utils/transport/events/index.ts` | 2698 | 按 domain shard re-export，避免单文件继续聚合所有事件定义。 | packages/utils transport event tests + typecheck。 |
| P3 | `packages/tuff-intelligence/src/types/intelligence.ts` / `packages/utils/types/intelligence.ts` | 2318 / 2316 | 按 provider、scene、runtime、usage、agent/workflow 类型拆分；先保持原入口 re-export。 | tuff-intelligence typecheck + downstream package typecheck。 |

## 执行约束

- 每批只拆一个 ownership 边界，避免与并行功能改动冲突。
- 拆分优先移动纯 helper / mapper / adapter；不在同批修改业务语义。
- 所有新文件必须有明确调用方，禁止预留空抽象。
- 每批都同步 `TODO` 与 `CHANGES`，并记录最贴近的定向测试。
