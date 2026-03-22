# v2.4.7 发版推进清单（2026-02-26）

> 目标：汇总当前文档进展与发版阻塞项，作为 `v2.4.7` 的单一执行入口。
> 更新时间：2026-03-22

## 1. 文档进展总览（关键入口）

| 文档 | 当前状态 | 说明 |
| --- | --- | --- |
| `docs/INDEX.md` | 已同步 | 新增发版推进入口，保留全局状态快照。 |
| `docs/plan-prd/README.md` | 已同步 | 增加 `v2.4.7` 发版推进里程碑与执行入口。 |
| `docs/plan-prd/TODO.md` | 已同步 | 增加 `v2.4.7` 发布清单（门禁/资产/发布动作）。 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步 | 记录本次“文档梳理 + 2.4.7 发版推进”变更。 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步 | 新增 `v2.4.7` GA 收口里程碑（Gate A/B/C/D/E 完成）。 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步 | 新增 `v2.4.7` 发版门禁执行记录（含 CI 自动回填与历史豁免边界）。 |

## 2. v2.4.7 发布门禁（Release Gates）

| Gate | 条件 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| Gate A: 版本基线 | 根包与 core-app 版本一致且为稳定版 | ✅ Done（historical） | 历史 `v2.4.7` 发布窗口已满足；当前 `2.4.9-beta.4` 工作区仅用于后续开发，不再阻塞历史 Gate。 |
| Gate B: 发布链路 | `build-and-release.yml`、Nexus release 同步、CLI npm 自动发布链路可用 | ✅ Done | 发布主线已收敛，Cloudflare Pages 使用平台侧 Git 部署。 |
| Gate C: 质量门禁 | lint/typecheck 通过或阻塞项明确可豁免 | ✅ Done | C1~C4 已完成：`packages/tuff-native`/`apps/nexus` lint 通过，全仓 typecheck + eslint 复扫通过。 |
| Gate D: 发布资产 | release notes（`zh/en`）与资产清单完备 | ✅ Done（historical backfill） | `Build and Release` run `23091014958`（`workflow_dispatch + sync_tag=v2.4.7`）已完成自动写入，manifest 与 sha256 已补齐。 |
| Gate E: 发布动作 | 创建并推送 `v2.4.7` tag，触发 CI 发布 | ✅ Done（historical） | 历史动作已完成：tag 已存在、Nexus release 已 `published`、`latest?channel=RELEASE` 命中 `v2.4.7`；不做重发版。 |

## 2.1 风险门禁补充（与 Gate E 绑定）

- 发布前必须检查 `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`：
  - 若存在 `P0=Open/In Progress`，禁止执行 Gate E。
  - `P1=Open` 可发布，但需有 `Accepted` 原因与补偿计划。
- 历史版本特殊规则（`v2.4.7`）：
  - `signature` 缺口按历史豁免处理（`Accepted waiver`）：GitHub 原始 `v2.4.7` 无 `.sig` 资产，manifest 也无 signature 字段；
  - 豁免仅对 `v2.4.7` 生效，`>=2.4.8` 恢复 `manifest + sha256 + signatureUrl` 严格要求。

## 3. 当前结论（已收口）

1. Gate D 已完成：`v2.4.7` 的 manifest 资产记录与 `sha256` 元数据已在 Nexus 侧回填闭环。
2. Gate E 保持 `Done (historical)`：历史 tag/release/latest 证据链成立，不做重发版。
3. `v2.4.7` 签名缺口继续按历史豁免（Accepted），且明确不扩展到 `>=2.4.8`。

## 3.1 Gate D 验收记录（2026-03-14）

- 执行方式：GitHub Actions `Build and Release` 手动触发，参数 `workflow_dispatch + sync_tag=v2.4.7`。
- 运行记录：run `23091014958`，`Sync Nexus Release` 全步骤成功（含 backfill）。
- 复核命令：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d --base-url https://tuff.tagzxia.com` 结果 `pass`。
- 远端核对（公开接口）：
  - `GET /api/releases/v2.4.7?assets=true`：`status=published`，`notes/notesHtml` 均为 `{ zh, en }`。
  - `GET /api/releases/v2.4.7/assets`：当前 4 个资产，包含 `tuff-release-manifest.json`，且资产 `sha256` 已完整。
  - `GET /api/releases/v2.4.7/download/{platform}/{arch}`：当前返回 `302`（可跳转下载）。
  - `GET /api/releases/v2.4.7/signature/{platform}/{arch}`：当前返回 `404`（历史豁免范围内）。

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

## 4. 后续主线（Gate D 收口后）

1. `2.4.9` 主线下一动作固定为：`Nexus 设备授权风控`（`权限中心 Phase 5`、`View Mode Phase2~4`、`CLI 分包迁移收口`、`主文档同步验收` 已完成）。
2. `Nexus 设备授权风控` 作为下一阶段后置项推进（执行入口：`docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`）。
3. CLI 兼容层生命周期固定为：`2.4.x` 保留 `unplugin` shim，`2.5.0` 退场。
4. `>=2.4.8` 发布恢复严格门禁：`manifest + sha256 + signatureUrl` 全量完整，不沿用 `v2.4.7` 豁免。

> 2026-03-16 更新：`CLI 分包迁移` 与 `主文档同步验收` 已完成，当前下一动作聚焦 `Nexus 设备授权风控`。
