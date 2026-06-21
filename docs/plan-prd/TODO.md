# Tuff TODO

> 更新时间：2026-06-21
> 定位：当前 2 周执行清单。细项分别落到 `TODO-AI.md`、`TODO-R3.md`、`TODO-nexus.md`；6 月以前记录已从文档树移除。

## 当前执行窗口

- 当前主线：按 `04-implementation/Roadmap-vNext-2026-06-18.md` 推进 R0-R9。
- 当前代码版本：root / CoreApp `2.4.12-beta.8`。
- 工作方式：related-only 小切片；不混合 CoreApp、Nexus、AI、docs、packages；不主动 git commit / push。
- 公共包发布不再作为独立 Roadmap blocker，版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为待办、平台后续或 release blocker；平台能力只保留 degraded / fail-closed 回归要求。

## 状态快照

| 主线 | 状态 | 下一步 |
| --- | --- | --- |
| R0 口径 / docs hygiene | done for current pass | 继续清理死链与超长文档；入口只保留当前 SoT。 |
| R1 Release Integrity | partial | 代码侧已修 GitHub artifact signature 传递、Nexus `signatureUrl` 真实记录与 signature endpoint 404 断点；继续补真实 GitHub Release ↔ Nexus endpoint/download/signature 运行证据。 |
| R2 AI Stable | partial | CoreBox AI Ask packaged surface 已 passed；继续重采 `corebox-search-states` 与 broader visible surfaces。 |
| R3 Search / Indexing Runtime | partial | FileProvider SQLite/FTS runtime-store migration、source-scoped `scan_progress` schema、durable scheduler evidence。 |
| R7 Nexus Governance | partial | production / preview operator evidence、D1/R2/live send/live storage、provider quota fail-closed。 |
| Nexus performance | separate thread | 详见 `TODO-nexus.md`，不要混入 CoreApp/AI/R3 改动。 |

## 当前阻塞

- `corebox-search-states` packaged 新证据仍缺：代码侧已修普通文本 stale image input 与 no-result layout refresh，但本机 packaged 复采受 macOS signing / AMFI / Gatekeeper 环境阻断。
- R1 Gate E 仍失败：代码侧 focused matrix 已补，仍缺真实 GitHub Release manifest / artifact signature / Nexus endpoint 运行证据。
- R3 schema 与 durable runtime-store 属数据结构和持久化边界改动，执行前必须单独列影响范围并确认。

## 验证命令

```bash
pnpm quality:pr
pnpm publish:check
pnpm publish:check:pack
pnpm -C "apps/core-app" run typecheck
pnpm typecheck:all
git diff --check
```

涉及 packaged evidence、真实平台 watcher、schema migration、production/preview evidence 时，必须补专项证据，不能只用 focused tests 替代。
