# 2.4.11 收口清单

> 更新时间：2026-06-18
> 定位：`2.4.11` 稳定版发版前收口清单的历史记录；当前阶段化路线以 `Roadmap-vNext-2026-06-18.md` 为准。

## 当前事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.11-beta.8`。
- 当前本地 HEAD：`47787615b fix(tuffex): make style entry build idempotent`。
- 当前分支：`master`；本地相对 `origin/master` 领先 9 个提交。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease / Nexus BETA latest sync / Gate D strict。
- 本轮不执行的高风险操作：`git push`、tag/release 创建、生产环境发布。

## Done Criteria

### 必须完成

- [x] 文档入口同步到 `2.4.11-beta.8` 与当前 `HEAD=47787615b`。
- [x] `2.4.11` release checklist 明确本轮阻塞项与非阻塞项。
- [x] `pnpm quality:pr` 与完整 `pnpm quality:release` 通过。
- [x] `git diff --check` 通过。
- [x] Nexus docs navigation 本轮切片通过 focused Vitest、scoped ESLint 与 Nexus typecheck。
- [x] Release integrity debt 明确：Nexus 资产 `sha256` / `signatureUrl` / signature endpoint 缺口仍需在真实发布链路收口。
- [x] 公共包发布状态明确：后续不作为独立 Roadmap blocker，版本变更后以 GitHub 自动发版 workflow 结果为准。

### 不纳入本轮阻塞

- Windows App indexing / Everything registry PATH 运行证据。
- CoreBox function key / 手动索引通知运行证据。
- release-signed packaged AI UI 视觉证据。
- Nexus production/preview operator evidence、live send、live object storage、生产 D1 migration/backfill、真实 provider quota fail-closed。

## 验证命令

优先顺序：

1. `pnpm -C "apps/nexus" exec vitest run "test/api/docs/navigation.get.test.ts"`
2. `pnpm -C "apps/nexus" exec eslint --cache --no-warn-ignored "server/api/docs/navigation.get.ts" "test/api/docs/navigation.get.test.ts"`
3. `pnpm -C "apps/nexus" run typecheck`
4. `pnpm quality:pr`
5. `pnpm publish:check`
6. `pnpm publish:check:pack`
7. `pnpm quality:release`
8. `git diff --check`

说明：`quality:release` 是最终 release/milestone 入口；本轮已通过，执行过程中仍有 Vite dynamic import / browser externalization 与 lottie eval 等既有 build warnings，但未阻断 release gate。

## 本轮验证结果

- `pnpm -C "apps/nexus" exec vitest run "test/api/docs/navigation.get.test.ts"`：通过。
- `pnpm -C "apps/nexus" exec eslint --cache --no-warn-ignored "server/api/docs/navigation.get.ts" "test/api/docs/navigation.get.test.ts"`：通过。
- `pnpm -C "apps/nexus" run typecheck`：通过。
- `pnpm quality:pr`：通过。
- `pnpm publish:check`：通过。
- `pnpm publish:check:pack`：通过。
- `pnpm typecheck:all`：通过；已先构建 TuffEx，避免 Nexus/CoreApp 并发读取 TuffEx `dist` 的竞态。
- `pnpm quality:release`：通过。
- `git diff --check`：通过。

## Release Integrity 待办

- 补齐 Nexus release assets 的 `sha256` 回填与展示验证。
- 补齐 `signatureUrl` 与 signature endpoint 的真实可用性验证。
- 确认 generated GitHub/Nexus release notes 的 download matrix 与实际资产一致。
- 确认 `tuff-release-manifest.json` 与当前 workflow 平台前缀资产命名保持一致。

## 公共包发布口径

- 本地已完成 `publish:check` / `publish:check:pack`。
- 已确认待发布包 packed manifest 不含 `catalog:`、workspace-only 或 dev-only 污染；`@talex-touch/tuffex` 的 `vue-tsc` devDependency 已从 workspace catalog 固定为可发布 semver range。
- 当前 Roadmap 不再把公共包发布作为独立 blocker；后续以版本变更后的 GitHub 自动发版 workflow 结果为准。

## 后续顺序

1. 修复或记录本轮验证失败项。
2. 收口 release integrity debt。
3. 回到 UI 语义控件与 File write/store boundary。
4. 再推进 `2.5.0` AI packaged 文本/OCR evidence。
