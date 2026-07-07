# 稳定性与架构优化总览

> 更新时间：2026-07-04
> 定位：当前文档与代码优化的执行导航。本文不替代 Roadmap / TODO / Evidence Matrix，只把稳定性优先级、架构代码落点和验证口径汇总到一个入口。

## 1. 读取顺序

先读当前 SoT，再进入专题：

1. `Roadmap-vNext-2026-06-18.md`：R0-R9 阶段目标。
2. `../TODO.md`：当前 2 周执行清单。
3. `../TODO-AI.md`：R2 AI Stable visible evidence。
4. `../TODO-R3.md`：R3 Search / Indexing Runtime。
5. `../TODO-nexus.md`：Nexus performance 独立线程。
6. `../docs/PRD-QUALITY-BASELINE.md`：类型、存储、同步、平台、AI、索引和 i18n 质量边界。

历史审计报告只作为背景，不作为当前完成状态。遇到状态冲突时，以 `TODO.md`、Roadmap 与对应 Evidence Matrix 为准。

## 2. 当前稳定性优先级

| 优先级 | 主线 | 目标 | 不做什么 |
| --- | --- | --- | --- |
| P0 | R1 Release Integrity | 闭环 GitHub Release、Nexus metadata、download、signature endpoint 与 public key | 不用 focused tests 代替真实 release asset evidence |
| P0 | R2 AI Stable | 关闭 Assistant / Workflow / Provider broader visible surfaces，保证 CoreBox Stable 口径不被 Beta surface 混淆 | 不把 mock provider、dry-run、CDP raw 诊断写成 packaged Electron 成功 |
| P0 | R3 Indexing Runtime | durable job history、Settings diagnostics 与 runtime task/store 边界先稳定 | 未确认前不实施 SQLite/FTS ownership 或 `scan_progress` schema migration |
| P1 | Startup / Performance | 保持 packaged hot/cold startup baseline 可复测，启动 critical path 不新增串行阻塞 | 不把非首屏 provider、plugin、watcher、telemetry hydrate 放回 mount 前 |
| P1 | Transport / Plugin Trust | typed transport、capability gate、secret boundary、fail-closed reason 持续收敛 | 不新增 raw event 分发、旧 channel bypass 或明文 secret 存储 |
| P2 | UI / TuffEx / i18n | 语义控件、keyboard/focus、message catalog 与 Domain Lexicon 分批清理 | 不新增中文 fallback 或双语三元表达式作为生产路径 |

## 3. 架构代码优化落点

### R1 Release Integrity

- 代码落点：`apps/core-app` update provider、`apps/nexus` release API、release asset import/link/upload 逻辑。
- 优化方向：签名 URL 只来自真实 `.sig/.asc` 或签名资源记录；无签名不得生成会 404 的 `signatureUrl`。
- 验收重点：同一 release matrix 上 `sha256`、`downloadUrl`、`signatureUrl`、signing public key 与 CoreApp verifier 一致。

### R2 AI Stable

- 代码落点：CoreBox AI Ask、Assistant typed events、Provider registry observability、Workflow Review Queue。
- 优化方向：Stable 只承诺 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、provider routing 与固定失败路径；其它 surface 保持 Beta / Experimental evidence。
- 验收重点：每个 visible surface 必须绑定 screenshot/recording 或可审计 JSON artifact，并通过 strict verifier 的对应 surface 检查。

### R3 Search / Indexing Runtime

- 代码落点：`IndexingRuntime`、FileProvider scan/progress/index scheduler、`packages/utils/search` runtime primitives、Settings diagnostics。
- 优化方向：先补 durable job history 与 diagnostics chip，再做高风险 schema 设计；将 root/path/progress/retry/reason 规则沉到 SDK primitive 或 runtime store。
- 验收重点：focused tests 证明 contract，真实/packaged Settings evidence 证明用户可见；schema migration 必须先有兼容读写、rollback、row-count diff 与 integrity snapshot。

### Cross-cutting Runtime Safety

- 代码落点：typed transport builder、secure store、network facade、plugin capability gate、dynamic execution boundary。
- 优化方向：新增跨层调用走 domain SDK / typed transport；SQLite 仍是本地业务 SoT；平台不可用必须返回 degraded / unsupported reason。
- 验收重点：不新增裸 `ipcMain/ipcRenderer`、raw event 字符串、direct `fetch/axios`、普通 JSON SoT 或明文 secret。

## 4. 推荐执行切片

| 切片 | 范围 | 交付物 | 最近验证 |
| --- | --- | --- | --- |
| Docs stability pass | 入口事实、死链、超长文档分层 | README / INDEX / CHANGES / Quality Baseline 同步；长专题补 TL;DR | `git diff --check` |
| R1 signature evidence pass | release asset 与 signing key | 真实 GitHub Release + Nexus endpoint evidence | R1 focused tests + release integrity probe |
| R2 visible surface pass | 单个 Assistant / Provider / Workflow surface | manifest、PNG/JSON artifact、README/TODO-AI/CHANGES 同步 | `visible:experience:verify` 对应 strict gate |
| R3 durable history pass | runtime job history 与 Settings diagnostics | append/update/store tests，Settings chip evidence | R3 focused Vitest + CoreApp typecheck |
| R3 migration design pass | SQLite/FTS ownership、`scan_progress` schema | 影响范围、兼容读写、rollback、验证矩阵 | 设计评审；未确认不实现 |
| Runtime safety pass | transport、secret、network、dynamic execution | typed builder / facade / capability gate 小切片 | scoped typecheck/lint/focused tests |

## 5. 文档维护规则

- 当前状态只写在入口文档和专题 TODO；历史流水进 `CHANGES.md` 或 evidence report。
- 行为、接口或架构变化至少同步 `README.md`、`TODO.md`、`CHANGES.md`、`docs/INDEX.md` 之一。
- 目标或质量门禁变化才同步 Roadmap 与 `PRD-QUALITY-BASELINE.md`。
- 不在长期文档里固化本地 `HEAD`、dirty worktree 或临时环境状态；执行前读取 `package.json`、`git status` 与对应 SoT。
- 每批只处理一个主题。R1、R2、R3、Nexus performance、TuffEx / SDK 债务不要混批验证或混批提交。

## 6. 最小验证矩阵

```bash
git diff --check
pnpm quality:pr
pnpm -C "apps/core-app" run typecheck
pnpm typecheck:all
pnpm nexus:build
```

按改动选择最近验证。若涉及 packaged evidence、真实平台 watcher、schema migration 或 production / preview evidence，必须补专项证据，不能只用 focused tests 替代。
