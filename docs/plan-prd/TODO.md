# Tuff TODO

> 更新时间：2026-06-24
> 定位：当前 2 周执行清单。细项分别落到 `TODO-AI.md`、`TODO-R3.md`、`TODO-nexus.md`；6 月以前记录已从文档树移除。

## 当前执行窗口

- 当前主线：按 `04-implementation/Roadmap-vNext-2026-06-18.md` 推进 R0-R9。
- 当前代码版本：root / CoreApp `2.4.13-beta.1`。
- 工作方式：related-only 小切片；不混合 CoreApp、Nexus、AI、docs、packages；不主动 git commit / push。
- 公共包发布不再作为独立 Roadmap blocker，版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为待办、平台后续或 release blocker；平台能力只保留 degraded / fail-closed 回归要求。

## 状态快照

| 主线 | 状态 | 下一步 |
| --- | --- | --- |
| R0 口径 / docs hygiene | done for current pass | 继续清理死链与超长文档；入口只保留当前 SoT。 |
| R1 Release Integrity | blocked by release assets | `v2.4.12-beta.8` 真实链路已复采：Nexus latest/assets/download 通过，GitHub manifest 存在；仍缺 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key。 |
| R2 AI Stable | partial | CoreBox AI Ask、`corebox-search-states`、`app-index-workbench`、`browser-login-recovery` 与 `omnipanel-writing-tools` packaged surfaces 已 passed；继续收 Assistant / Workflow / Provider broader visible surfaces。 |
| R3 Search / Indexing Runtime | partial | FileProvider incremental DB persist、FTS write/delete 与 index worker flush 已收敛到 runtime/store evidence；剩余 SQLite/FTS durable migration、source-scoped `scan_progress` schema、durable scheduler evidence。 |
| R7 Nexus Governance | partial | production / preview operator evidence、D1/R2/live send/live storage、provider quota fail-closed。 |
| Nexus performance | separate thread | 详见 `TODO-nexus.md`，不要混入 CoreApp/AI/R3 改动。 |

## 当前阻塞

- R2 global visible gate 仍失败：CoreBox AI Ask、`corebox-search-states`、`app-index-workbench`、`browser-login-recovery` 与 `omnipanel-writing-tools` 已 passed；剩余阻塞来自 Assistant / Workflow / Provider broader surfaces pending。2026-06-24 app-index workbench 已用 packaged Settings UI + isolated userData 补到 summary/source/diagnostic/filter-empty evidence。
- R2 `assistant-screenshot-translate` 初步 MVP 代码切片已落地：Assistant typed events 拆分、VoicePanel 双入口、cursor-display screenshot -> image translate -> pin window 主流程与 focused tests 已完成；仍需 packaged visible evidence 后才能从 broader surface failure 中移除。
- R2 `assistant-screenshot-translate` 下一步 evidence checklist：packaged 环境分别采集剪贴板图片翻译成功、截图并翻译成功、pin window 展示 source/target 文本、provider unavailable、截图权限/unsupported failure 文案；同步 manifest / README / TODO-AI / CHANGES 后再关闭 surface。
- R2 2026-06-24 app-index evidence 后 inventory：strict gate 仍为 `gate.failures.length=34`；manifest 引用的 54 个唯一 artifact 均存在、非空且 JSON 可解析。`app-index-workbench` 不再出现在 failure list 中。
- R1 Gate E 仍失败：`docs/engineering/reports/release-integrity-2026-06-22/` 已绑定真实链路证据，阻塞项为发布资产签名材料与生产 signing key 配置缺失；旧本地 gate 缺已清理 risk-register 文件，本轮不作为闭环阻塞。
- R3 schema 与 durable runtime-store 属数据结构和持久化边界改动，执行前必须按 `TODO-R3.md` 的高风险迁移前置确认清单单独确认 SQLite/FTS、`scan_progress` 影响范围；2026-06-22 已完成的 runtime write evidence 小切片不包含 schema/migration。

## AI 批次估时

> 口径：单个 AI agent 连续执行，包含定位、必要代码修改、focused tests、evidence/文档同步；不包含等待外部凭证、人工平台操作或生产审批。

| 任务 | 预估 AI 时间 | 风险 / 备注 |
| --- | ---: | --- |
| R2 `provider-registry-observability` | 3-5h | 偏 UI / evidence，可作为中等风险批次。 |
| R2 `assistant-floating-ball-entry` | 3-5h | 涉及浮窗位置持久化、焦点不抢占与 Voice Panel 打开证据。 |
| R2 `provider-migration-evidence` | 3-6h | 必须确认 dry-run / execute 口径，且不能暴露 secret。 |
| R2 `assistant-screenshot-translate` | 2-4h evidence pass | 初步 MVP 代码已落地；剩余为剪贴板图片、截图翻译、pin window 与 provider/screenshot failure packaged evidence。 |
| R2 `workflow-use-model-review-queue` | 4-7h | Workflow、Review Queue、失败态和成本信号链路较长。 |
| R3 durable job history + Settings diagnostics | 5-8h | 可拆小切片；需要持久化边界、Settings recovery chip 与 evidence。 |
| R3 Quicklinks persistent feed | 6-10h | 官方插件持久 feed storage、clear / rebuild UI 与 Settings evidence。 |
| R3 Browser Bookmarks platform evidence | 4-8h | 主要取决于真实浏览器 profile、watch root 与 packaged evidence 可采性。 |
| R3 Everything productionization | 8-16h | Windows / SDK / CLI / registry / PATH / fail-closed evidence 链路长。 |
| R1 Release Integrity | 2-4h code/check pass，外部资产另算 | 缺 `.sig/.asc`、manifest signature、signing key；AI 不能凭空闭环。 |
| R7 Nexus Governance | 8-20h+ | production / preview、D1/R2/live send/provider quota 受环境和凭证限制。 |
| Nexus performance 单批 | 3-6h/批 | 独立线程推进；每批只处理一个页面族或一个 runtime 问题。 |

需要先设计并确认影响范围，不建议直接开干：

| 任务 | 预估 AI 时间 | 风险 / 备注 |
| --- | ---: | --- |
| R3 SQLite/FTS durable ownership migration | 8-14h | 数据结构 / 持久化所有权高风险；先出设计、兼容读写、rollback 与验证矩阵。 |
| R3 `scan_progress` source-scoped schema migration | 8-16h | schema/source migration 高风险；执行前必须单独确认数据清理范围和回滚策略。 |

## 分批执行计划

> 执行规则：每批只处理一个主题；R2 visible surface、R3 indexing、Nexus performance、TuffEx / SDK dirty files 不混批。每批结束都要同步对应 SoT 文档；如果只完成侦察或遇到环境 blocker，不能把 surface 标为 `passed`。

| 批次 | 默认任务 | 交付物 | 文档落点 |
| --- | --- | --- | --- |
| 30min 侦察批 | R2 visible gate preflight | strict failure 分组、surface artifact 要求、截图要求、下一批推荐 | `TODO.md`、`TODO-AI.md` |
| 3-5h 中等风险 | `provider-registry-observability` | provider health、scene latest run、filters、next-action hints evidence | `TODO-AI.md`、AI report README、manifest、CHANGES |
| 半天批 | `assistant-floating-ball-entry` | 单 surface evidence；不混 Workflow 或 screenshot translate | `TODO-AI.md`、专题 report、CHANGES |
| 长链路批 | `assistant-screenshot-translate`、`workflow-use-model-review-queue` | clipboard image / Review Queue 完整链路 evidence 或 blocker | `TODO-AI.md`、专题 report、CHANGES |
| R3 设计批 | durable job history + Settings diagnostics | append/update/store 最小设计、Settings chip 证据路径、focused test matrix | `TODO-R3.md` |
| 高风险迁移设计批 | SQLite/FTS ownership、`scan_progress` source-scoped schema | 影响范围、兼容读写、rollback、验证矩阵；不进入实现 | `TODO-R3.md`、必要时专题设计文档 |

### R2 surface 完成标准

- `coreapp-visible-experience-manifest.json` 对应 surface 的 `status`、`artifactPaths`、`checkedEvidence` 与 `notes` 同步更新。
- 运行 `coreapp-visible-experience-evidence.test.ts` 通过。
- 运行 strict verifier 后，全局 gate 可以继续失败，但本批 surface 不再出现在 failure list。
- 同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md`、`TODO-AI.md`、`CHANGES.md`；如影响总状态，同步本文件。

### R3 批次完成标准

- durable job history 先走设计和 focused tests，不触碰 schema。
- SQLite/FTS ownership 与 `scan_progress` migration 必须先按 `TODO-R3.md` 高风险清单完成确认；未确认前不得实施迁移。
- Browser Bookmarks、Everything、Quicklinks 只能用真实平台 / packaged evidence 关闭，不用 mock evidence 替代。

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
