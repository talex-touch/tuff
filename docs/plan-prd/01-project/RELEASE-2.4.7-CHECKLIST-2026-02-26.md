# v2.4.7 发版推进清单（2026-02-26）

> 目标：汇总当前文档进展与发版阻塞项，作为 `v2.4.7` 的单一执行入口。
> 更新时间：2026-02-26

## 1. 文档进展总览（关键入口）

| 文档 | 当前状态 | 说明 |
| --- | --- | --- |
| `docs/INDEX.md` | 已同步 | 新增发版推进入口，保留全局状态快照。 |
| `docs/plan-prd/README.md` | 已同步 | 增加 `v2.4.7` 发版推进里程碑与执行入口。 |
| `docs/plan-prd/TODO.md` | 已同步 | 增加 `v2.4.7` 发布清单（门禁/资产/发布动作）。 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步 | 记录本次“文档梳理 + 2.4.7 发版推进”变更。 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步 | 新增 `v2.4.7` GA 收口里程碑（Gate A/B/C）。 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步 | 新增 `v2.4.7` 发版门禁执行记录。 |

## 2. v2.4.7 发布门禁（Release Gates）

| Gate | 条件 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| Gate A: 版本基线 | 根包与 core-app 版本一致且为稳定版 | ✅ Done | `package.json` 与 `apps/core-app/package.json` 已对齐 `2.4.7`。 |
| Gate B: 发布链路 | `build-and-release.yml`、Nexus release 同步、CLI npm 自动发布链路可用 | ✅ Done | 发布主线已收敛，Cloudflare Pages 使用平台侧 Git 部署。 |
| Gate C: 质量门禁 | lint/typecheck 通过或阻塞项明确可豁免 | ⚠️ Open | 参考 `docs/reports/quality-scan-2026-02-26.md`，当前仍有 lint/typecheck 阻塞项。 |
| Gate D: 发布资产 | release notes（`zh/en`）与资产清单完备 | 🟡 In Progress | 需在 Nexus release 创建时补齐 notes、assets、签名信息。 |
| Gate E: 发布动作 | 创建并推送 `v2.4.7` tag，触发 CI 发布 | ⏸ Pending | 需在 Gate C/D 通过后执行。 |

## 3. 当前阻塞（必须处理）

1. `apps/nexus` 存在 TypeScript 错误（`pnpm -r --if-present --no-bail run typecheck` 未通过）。
2. 全仓 lint 存在 error（`packages/tuff-native` + `apps/nexus`）。
3. 发布前需确认 Nexus Release notes 结构为 `{ zh, en }` 且与 `v2.4.7` tag 对齐。

## 4. 建议执行顺序（最小可行）

1. 修复 lint/typecheck 阻塞项，至少恢复 `apps/nexus` 与 `packages/tuff-native` 门禁通过。
2. 在 Nexus release 管理侧准备 `v2.4.7` 的 notes/assets（含签名与 manifest）。
3. 创建 `v2.4.7` tag 触发 `build-and-release`，观察 GitHub Release 与 Nexus 同步结果。
4. 发布后回写 `CHANGES.md` 与 TODO 对应条目，关闭本清单的 Gate D/E。
