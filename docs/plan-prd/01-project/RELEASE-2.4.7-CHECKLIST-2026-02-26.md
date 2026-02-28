# v2.4.7 发版推进清单（2026-02-26）

> 目标：汇总当前文档进展与发版阻塞项，作为 `v2.4.7` 的单一执行入口。
> 更新时间：2026-02-28

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
| Gate E: 发布动作 | 创建并推送 `v2.4.7` tag，触发 CI 发布 | ⏸ Pending | 需在 Gate C/D 通过后执行；且必须满足风险门禁（`P0=0`）。 |

## 2.1 风险门禁补充（与 Gate E 绑定）

- 发布前必须检查 `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`：
  - 若存在 `P0=Open/In Progress`，禁止执行 Gate E。
  - `P1=Open` 可发布，但需有 `Accepted` 原因与补偿计划。

## 3. 当前阻塞（必须处理）

1. `apps/nexus` 存在 TypeScript 错误（`pnpm -r --if-present --no-bail run typecheck` 未通过）。
2. 全仓 lint 存在 error（`packages/tuff-native` + `apps/nexus`）。
3. 发布前需确认 Nexus Release notes 结构为 `{ zh, en }` 且与 `v2.4.7` tag 对齐。

## 3.1 Gate C 执行拆解（按批次推进）

| 批次 | 任务 | 范围 | 负责人（建议） | 验收命令 | 状态 |
| --- | --- | --- | --- | --- | --- |
| C1 | 清零阻断 lint error | `packages/tuff-native/index.js`、`packages/tuff-native/native-loader.js`、`apps/nexus/server/utils/__tests__/intelligence-agent-graph-runner.test.ts` | Tuff Native + Nexus Backend | `pnpm -C "packages/tuff-native" exec eslint "index.js" "native-loader.js"`；`pnpm -C "apps/nexus" exec eslint "server/utils/__tests__/intelligence-agent-graph-runner.test.ts"` | Open |
| C2 | 清零 watermark 类型错误 | `apps/nexus` 下 watermark 相关 8 个文件（组件/composable/server utils/pages） | Nexus FE + Nexus Backend | `pnpm -C "apps/nexus" run typecheck` | Open |
| C3 | 清零 auth/device 类型错误 | `apps/nexus/server/api/auth/[...].ts`、`apps/nexus/app/pages/device-auth.vue`、`apps/nexus/app/plugins/watermark-risk.client.ts`、`apps/nexus/app/composables/useCurrentUserApi.ts` | Nexus Backend | `pnpm -C "apps/nexus" run typecheck` | Open |
| C4 | 复扫并固化 Gate C 结果 | 全仓 lint/typecheck（按发布口径） | Release Owner | `pnpm -r --if-present --no-bail run typecheck`；`pnpm -r --no-bail --filter "./apps/*" --filter "./packages/*" --filter "./plugins/*" exec eslint --cache --no-warn-ignored "**/*.{js,jsx,ts,tsx,vue,mjs,cjs,cts,mts}"` | Open |

> 备注：根据 `docs/reports/quality-scan-2026-02-26.md`，当前 Gate C 阻断主要集中在 `apps/nexus`（36 个 TS error）与 `packages/tuff-native`（4 个 lint error）+ `apps/nexus` 1 个 lint error。

## 4. 建议执行顺序（最小可行）

1. 先做 C1（最快清零 lint 阻断），避免后续扫描噪音。
2. 并行推进 C2 + C3，按模块归口修复 `apps/nexus` 类型错误。
3. 执行 C4 复扫并回填 Gate C 结论（通过或豁免清单）。
4. Gate C 关闭后推进 Gate D（assets/notes/signature/manifest）。
5. Gate D 关闭且风险门禁通过后执行 Gate E（tag 发布）。
