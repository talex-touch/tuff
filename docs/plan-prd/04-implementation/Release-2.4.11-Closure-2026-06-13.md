# 2.4.11 收口清单

> 更新时间：2026-06-13
> 定位：`2.4.11` 稳定版发版前的当前收口清单。按最新维护决策，Windows/macOS 真机人工回归不纳入本轮阻塞项；相关平台专项证据进入后续跟进，不作为本清单完成条件。

## 当前事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.11-beta.8`。
- 当前本地 HEAD：`47787615b fix(tuffex): make style entry build idempotent`。
- 当前分支：`master`；本地相对 `origin/master` 领先 9 个提交。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease / Nexus BETA latest sync / Gate D strict。
- 本轮不执行的高风险操作：`git push`、真实 npm publish、tag/release 创建、生产环境发布。

## Done Criteria

### 必须完成

- [x] 文档入口同步到 `2.4.11-beta.8` 与当前 `HEAD=47787615b`。
- [x] `2.4.11` release checklist 明确本轮阻塞项与非阻塞项。
- [x] `pnpm quality:pr` 与完整 `pnpm quality:release` 通过。
- [x] `git diff --check` 通过。
- [x] Nexus docs navigation 本轮切片通过 focused Vitest、scoped ESLint 与 Nexus typecheck。
- [x] Release integrity debt 明确：Nexus 资产 `sha256` / `signatureUrl` / signature endpoint 缺口仍需在真实发布链路收口。
- [x] 公共 npm 子包发布状态明确：本地只做 pack/manifest/publish preflight，不做真实 publish；真实发布需要可用 `NPM_TOKEN` 与用户确认。

### 不纳入本轮阻塞

- Windows/macOS 真机人工回归。
- Windows App indexing / Everything registry PATH 真机证据。
- CoreBox function key / 手动索引通知真机证据。
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

## NPM 发布待办

- 本地已完成 `publish:check` / `publish:check:pack`。
- 已确认待发布包 packed manifest 不含 `catalog:`、workspace-only 或 dev-only 污染；`@talex-touch/tuffex` 的 `vue-tsc` devDependency 已从 workspace catalog 固定为可发布 semver range。
- 真实 `npm publish` / package publish workflow 必须在具备 `@talex-touch` scope 权限的 `NPM_TOKEN` 后由用户确认触发。
- 真实发布完成后回填 npm package URL、版本、时间与 workflow run id。

## 后续顺序

1. 修复或记录本轮验证失败项。
2. 收口 release integrity debt。
3. 准备真实 npm publish / workflow evidence，但执行前再次确认。
4. 回到 UI 语义控件与 File write/store boundary。
5. 再推进 `2.5.0` AI packaged 文本/OCR evidence。
