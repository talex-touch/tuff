# v2.4.7 发版推进清单（2026-02-26）

> 目标：汇总当前文档进展与发版阻塞项，作为 `v2.4.7` 的单一执行入口。
> 更新时间：2026-03-14

## 1. 文档进展总览（关键入口）

| 文档 | 当前状态 | 说明 |
| --- | --- | --- |
| `docs/INDEX.md` | 已同步 | 新增发版推进入口，保留全局状态快照。 |
| `docs/plan-prd/README.md` | 已同步 | 增加 `v2.4.7` 发版推进里程碑与执行入口。 |
| `docs/plan-prd/TODO.md` | 已同步 | 增加 `v2.4.7` 发布清单（门禁/资产/发布动作）。 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步 | 记录本次“文档梳理 + 2.4.7 发版推进”变更。 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步 | 新增 `v2.4.7` GA 收口里程碑（Gate A/B/C/E 完成，Gate D 进行中）。 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步 | 新增 `v2.4.7` 发版门禁执行记录（含 CI 自动回填与历史豁免边界）。 |

## 2. v2.4.7 发布门禁（Release Gates）

| Gate | 条件 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| Gate A: 版本基线 | 根包与 core-app 版本一致且为稳定版 | ✅ Done（historical） | 历史 `v2.4.7` 发布窗口已满足；当前 `2.4.8-beta.3` 工作区仅用于后续开发，不再阻塞历史 Gate。 |
| Gate B: 发布链路 | `build-and-release.yml`、Nexus release 同步、CLI npm 自动发布链路可用 | ✅ Done | 发布主线已收敛，Cloudflare Pages 使用平台侧 Git 部署。 |
| Gate C: 质量门禁 | lint/typecheck 通过或阻塞项明确可豁免 | ✅ Done | C1~C4 已完成：`packages/tuff-native`/`apps/nexus` lint 通过，全仓 typecheck + eslint 复扫通过。 |
| Gate D: 发布资产 | release notes（`zh/en`）与资产清单完备 | 🟡 In Progress | 当前只保留“资产元数据一致性”动作：本地 dry-run 对账 + GitHub CI `sync-nexus-release` 自动写入（已接入 backfill，且仅 `v2.4.7` 启用）。 |
| Gate E: 发布动作 | 创建并推送 `v2.4.7` tag，触发 CI 发布 | ✅ Done（historical） | 历史动作已完成：tag 已存在、Nexus release 已 `published`、`latest?channel=RELEASE` 命中 `v2.4.7`；不做重发版。 |

## 2.1 风险门禁补充（与 Gate E 绑定）

- 发布前必须检查 `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`：
  - 若存在 `P0=Open/In Progress`，禁止执行 Gate E。
  - `P1=Open` 可发布，但需有 `Accepted` 原因与补偿计划。
- 历史版本特殊规则（`v2.4.7`）：
  - `signature` 缺口按历史豁免处理（`Accepted waiver`）：GitHub 原始 `v2.4.7` 无 `.sig` 资产，manifest 也无 signature 字段；
  - 豁免仅对 `v2.4.7` 生效，`>=2.4.8` 恢复 `manifest + sha256 + signatureUrl` 严格要求。

## 3. 当前阻塞（必须处理）

1. 远端只读核对显示 release notes/notesHtml 已为 `{ zh, en }`（与 `v2.4.7` 对齐），该项已通过。
2. Gate D 剩余唯一动作：完成 Nexus assets 元数据一致性闭环（优先 `sha256` + manifest 资产记录）。
3. `v2.4.7` 签名缺口按历史豁免登记，不作为本轮 Gate D 关闭阻塞。

## 3.1 Gate D 本地预检记录（2026-03-14）

- 预检命令：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d --base-url https://tuff.tagzxia.com`
- 结果：`pass`（notes zh/en 非空、`P0=0`）；`manifest` 为 `pending`（本地未获取 release 资产）。
- Gate E 硬门禁演练：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-e --base-url https://tuff.tagzxia.com --strict true` 返回 `fail`（版本基线漂移 + signature/sha256/manifest 缺失）。
- 远端只读核对（公开接口）：
  - `GET /api/releases/v2.4.7?assets=true`：`status=published`，`notes/notesHtml` 均为 `{ zh, en }`。
  - `GET /api/releases/v2.4.7/assets`：仅 3 个平台资产（win32/linux/darwin x64），`sha256/signatureUrl` 为空，且无 `tuff-release-manifest.json`。
  - `GET /api/releases/v2.4.7/signature/{platform}/{arch}`：当前返回 `404`。
  - `GET /api/releases/v2.4.7/download/{platform}/{arch}`：当前返回 `302`（可跳转下载）。

## 3.2 历史 Gate E 证据（2026-03-14 核对）

- `git tag -l v2.4.7` 与 `git ls-remote --tags origin v2.4.7` 均可命中。
- `GET /api/releases/v2.4.7?assets=true` 返回 `status=published`。
- `GET /api/releases/latest?channel=RELEASE` 返回 `release.tag=v2.4.7`。
- 结论：Gate E 按历史已执行关闭，不做重发版动作。

## 3.3 Gate C 执行拆解（按批次推进）

| 批次 | 任务 | 范围 | 负责人（建议） | 验收命令 | 状态 |
| --- | --- | --- | --- | --- | --- |
| C1 | 清零阻断 lint error | `packages/tuff-native/index.js`、`packages/tuff-native/native-loader.js`、`apps/nexus/server/utils/__tests__/intelligence-agent-graph-runner.test.ts` | Tuff Native + Nexus Backend | `pnpm -C "packages/tuff-native" exec eslint "index.js" "native-loader.js"`；`pnpm -C "apps/nexus" exec eslint "server/utils/__tests__/intelligence-agent-graph-runner.test.ts"` | Done |
| C2 | 清零 watermark 类型错误 | `apps/nexus` 下 watermark 相关 8 个文件（组件/composable/server utils/pages） | Nexus FE + Nexus Backend | `pnpm -C "apps/nexus" run typecheck` | Done |
| C3 | 清零 auth/device 类型错误 | `apps/nexus/server/api/auth/[...].ts`、`apps/nexus/app/pages/device-auth.vue`、`apps/nexus/app/plugins/watermark-risk.client.ts`、`apps/nexus/app/composables/useCurrentUserApi.ts` | Nexus Backend | `pnpm -C "apps/nexus" run typecheck` | Done |
| C4 | 复扫并固化 Gate C 结果 | 全仓 lint/typecheck（按发布口径） | Release Owner | `pnpm -r --if-present --no-bail run typecheck`；`pnpm -r --no-bail --filter "./apps/*" --filter "./packages/*" --filter "./plugins/*" exec eslint --cache --no-warn-ignored "**/*.{js,jsx,ts,tsx,vue,mjs,cjs,cts,mts}"` | Done |

> 备注：`docs/reports/quality-scan-2026-02-26.md` 为历史快照，最新口径以本清单 Gate C 复扫结果为准。

## 4. 建议执行顺序（最小可行）

1. 执行 Gate D 本地对账：`node scripts/backfill-release-assets-from-github.mjs --tag v2.4.7 --base-url https://tuff.tagzxia.com --dry-run`（确认差异）。
2. 触发 GitHub Actions `build-and-release.yml` 的 `sync-nexus-release` 路径完成自动同步写入（已接入 `Backfill Nexus asset metadata from GitHub manifest`，仅 `v2.4.7` 启用；不做本地手工 API key 写入）。
3. 同步后复核：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d --base-url https://tuff.tagzxia.com`，确保结果 `pass`。
4. 在 `RISK-REGISTER` 与本清单同步记录 `v2.4.7` 签名历史豁免（Accepted）。
5. Gate D 关闭后主线切换到 `View Mode 安全收口`，不再执行 `v2.4.7` Gate E 发布动作。
