# 当前项目进程与执行计划

> 更新时间：2026-06-17
> 定位：把当前项目进程梳理成可执行 Plan；作为 `README` / `TODO` / `INDEX` 入口页的短期执行 SoT。历史事实仍以 `../01-project/CHANGES.md` 为准，具体任务状态仍以 `../TODO.md` 为准。

## 1. 当前事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.12-beta.6`。
- 当前分支：`master`；本地相对 `origin/master` 领先 `1` 个提交。
- 当前 HEAD：`fb7424772 fix: restore auth secure storage defaults`。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与 Gate D strict 复核。
- `2.4.11` release checklist 已有完成记录：`quality:pr`、`publish:check`、`publish:check:pack`、`typecheck:all`、`quality:release` 与 `git diff --check` 均已通过。
- 当前主要偏差：部分入口文档仍停在 `2.4.11-beta.8` / `HEAD=47787615b` 口径，需随本计划同步到 `2.4.12-beta.6`。

## 2. 当前主线

1. **先稳发布口径**：把 `2.4.11` 收口证据、`2.4.12-beta.6` 当前版本、release integrity debt 与 npm publish debt 拆清楚，不把本地 preflight 当成真实发布。
2. **再补 AI 真实体验证据**：CoreBox AI Ask 已接真实 streaming，但仍需本地 provider routing、Ollama / Local Provider 与 packaged Electron 文本/OCR success/failure evidence。
3. **继续治理执行边界**：插件 shell/network/fs/clipboard permission、secret storage、safe HTML/Markdown、Widget runtime sandbox 与 raw/legacy channel 继续按 focused evidence 小切片推进。
4. **回到 Search / Indexing 主线**：Search Provider / Indexed Source / Indexing Runtime 已形成抽象基础，下一优先级是 File write/store boundary，其次 Everything productionization 与 Quicklinks feed/UI evidence。

## 3. P0 执行计划

| 优先级 | 目标 | 当前状态 | 下一动作 | 验收证据 |
| --- | --- | --- | --- | --- |
| P0-1 | 文档口径收敛 | 入口页存在版本/HEAD 漂移 | 同步 `README` / `TODO` / `INDEX` / `CHANGES` 到本计划 | `git diff --check`；入口页均指向本文档 |
| P0-2 | AI provider routing | CoreBox AI Ask 已真实 streaming，但 Nexus disabled provider 仍可能被 capability binding 带入 | 保持 Nexus disabled；能力候选只返回 provider 与 binding 均启用项；用本地 Ollama / Local Provider 验证 `local-default` | CoreApp AI focused tests；`plugins/touch-intelligence` build；实际运行不访问 Nexus |
| P0-3 | AI Stable packaged evidence | AI 不是空壳，但不能标记体验闭环 | 采集 packaged Electron 文本/OCR 成功、provider 不可用、quota/model unsupported、权限拒绝与 fallback UI 证据 | 截图/录屏 evidence；失败路径可解释且 fail-closed |
| P0-4 | Release integrity | release checklist 已通过，资产完整性仍是 debt | 补 Nexus asset `sha256`、`signatureUrl`、signature endpoint 与 manifest/download matrix 验证 | 真实 release sync evidence；Nexus/GitHub asset matrix 对齐 |
| P0-5 | NPM publish evidence | 本地 pack/preflight 已通过，真实 publish 缺可用 token | 等具备 `@talex-touch` scope 的 `NPM_TOKEN`，执行前再次确认 | npm package URL、版本、时间、workflow run id |

## 4. P1 执行计划

| 优先级 | 目标 | 当前状态 | 下一动作 | 验收证据 |
| --- | --- | --- | --- | --- |
| P1-1 | File write/store boundary | Search / Indexing runtime 抽象已推进 | 迁移 File write/store 边界，避免绕过统一 source/runtime 口径 | Focused tests；无 raw storage / 明文 JSON sync 新增依赖 |
| P1-2 | UI 语义控件 | 首批语义控件已落地，仍有主路径债务 | 继续替换旧式 `div/span @click`，保持 TuffEx 风格 | Scoped ESLint / focused UI tests / accessibility smoke |
| P1-3 | Plugin trust boundary | 官方插件 manifest / permission / clipboard evidence 已覆盖大量路径 | 复核剩余 shell/OS/network/fs/clipboard surface；补平台执行 evidence | package-level official plugin focused tests；真实平台 smoke 后置 |
| P1-4 | Everything / Windows evidence | 路径过滤、UWP handoff、icon round-trip 已有 focused coverage | 采集 Windows App indexing、Everything registry PATH、手动索引通知真机证据 | Windows acceptance / capability evidence |
| P1-5 | Nexus governance production evidence | 本地 Wrangler/Miniflare 证据已有 | 补 production/preview operator、live send、object storage、D1 migration/backfill、真实 provider quota | 生产/preview 可复现 runbook evidence |

## 5. 明确非阻塞项

- Windows/macOS 真机人工回归不阻塞当前 release checklist，但保留为平台专项 evidence。
- Workflow / Skills / Automation 继续保持 Beta，不进入当前 Stable 承诺。
- 本地模型 runtime `2.5.5` 与 ASR `2.5.8` 只保持 PRD 锁方向，不抢当前 AI 文本/OCR evidence。
- 真实 npm publish、tag/release 创建、生产环境发布与 `git push` 都不在无确认情况下执行。

## 6. 质量门禁

- 文档同步：`git diff --check`。
- PR 级质量：`pnpm quality:pr`。
- 发布级质量：`pnpm quality:release`。
- 包发布预检：`pnpm publish:check` 与 `pnpm publish:check:pack`。
- AI 当前最近路径：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/plugin/plugin.test.ts"`、`pnpm -C "plugins/touch-intelligence" run build`、`pnpm -C "packages/tuffex" run typecheck`。

## 7. Guardrails

- 不把本地 mock、dry-run、preflight 或 focused test 误写成生产完成。
- 不新增 legacy/raw channel、旧 storage protocol、旧 SDK bypass 或明文 secret/localStorage 依赖。
- 不把 JSON 作为业务明文同步/落盘权威源；SQLite 仍是本地 SoT，sync payload 必须保持密文口径。
- 不以 `deviceId` 派生密钥；敏感凭据继续走 CoreApp local root-key secure-store。
- 不在没有用户确认时执行 `git push`、真实 npm publish、tag/release 创建、生产 API/DB 操作。

## 8. 参考入口

- `../TODO.md`：当前 2 周执行清单。
- `../README.md`：PRD / 规划主入口。
- `../01-project/CHANGES.md`：近 30 天事实与变更索引。
- `Release-2.4.11-Closure-2026-06-13.md`：`2.4.11` release checklist 与质量门禁证据。
- `AI-2.5x-Execution-Plan-2026-06-16.md`：AI 2.5.x 分阶段执行计划。
- `../03-features/search/INDEXING-RUNTIME-V1-PLAN.md`：Indexing Runtime V1 统一搜索源计划。
