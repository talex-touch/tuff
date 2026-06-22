# Tuff TODO

> 更新时间：2026-06-22
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
| R1 Release Integrity | blocked by release assets | `v2.4.12-beta.8` 真实链路已复采：Nexus latest/assets/download 通过，GitHub manifest 存在；仍缺 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key。 |
| R2 AI Stable | partial | CoreBox AI Ask packaged surface 已 passed；`corebox-search-states` packaged 复采已取得 idle/no-result DOM partial evidence，继续补窗口 resize、searching/result rows 与 broader visible surfaces。 |
| R3 Search / Indexing Runtime | partial | FileProvider incremental DB persist、FTS write/delete 与 index worker flush 已收敛到 runtime/store evidence；剩余 SQLite/FTS durable migration、source-scoped `scan_progress` schema、durable scheduler evidence。 |
| R7 Nexus Governance | partial | production / preview operator evidence、D1/R2/live send/live storage、provider quota fail-closed。 |
| Nexus performance | separate thread | 详见 `TODO-nexus.md`，不要混入 CoreApp/AI/R3 改动。 |

## 当前阻塞

- `corebox-search-states` packaged 新证据仍缺：2026-06-22 本机开发签名已绕过 packaged 启动阻断，idle 与 no-result DOM/stale-image recovery 已复采；当前阻塞是 BrowserWindow 仍停在 `720x56` 导致 no-result 截图不覆盖 DOM，searching/warm-up 不可见，fresh profile 无 result rows，source/status/reason pills 无真实样本。
- R1 Gate E 仍失败：`docs/engineering/reports/release-integrity-2026-06-22/` 已绑定真实链路证据，阻塞项为发布资产签名材料与生产 signing key 配置缺失；旧本地 gate 缺已清理 risk-register 文件，本轮不作为闭环阻塞。
- R3 schema 与 durable runtime-store 属数据结构和持久化边界改动，执行前必须单独列影响范围并确认；2026-06-22 已完成的 runtime write evidence 小切片不包含 schema/migration。

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
