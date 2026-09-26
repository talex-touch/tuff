# Implement — TxPrismGlow

## Checklist

1. [ ] 协调：给 peer（talex-touch-0d）发消息，认领以下插入点，并约定 tuffex 构建锁和 `:3200` 重启的时机。
   - `components.ts` / `pro/index.ts`：`prism-glow` 一行；
   - `DocsSidebar.vue` / `recategorize-component-docs.py` / `index.{zh,en}.mdc`：`border-beam` 之后一行；
   - 画廊：一个 cell；
   - `demo-registry.ts`：两行。
2. [ ] 组件：新建 `prism-glow/{index.ts, src/types.ts, src/TxPrismGlow.vue}`，按 design.md 写。
3. [ ] 注册：在 `components.ts`、`pro/index.ts` 各加一行 `export * from '…/prism-glow/index'`。
4. [ ] 单测：新建 `prism-glow/__tests__/prism-glow.test.ts`。
5. [ ] 视觉调参：把真实 SFC 编译进 harness（`/tmp/search-pulse-harness/build.mjs` 的套路，换成 prism-glow），在 ego 里冻结多个时间点截帧，暗色 / 亮色 / 高对比 / reduced-motion 都要看，调到过 AC1 / AC4。
6. [ ] 文档与 demo：
   - `prism-glow.{zh,en}.mdc`；
   - `PrismGlowShowcaseDemo.vue`、`PrismGlowSearchDemo.vue`；
   - `demo-registry.ts`、侧边栏、recategorize、hub 索引、画廊 cell。
7. [ ] tuffex dist 构建。拿锁后执行：
   ```bash
   mkdir /tmp/tuffex-build.lock && ( cd packages/tuffex && npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts ); rmdir /tmp/tuffex-build.lock
   ```
   构建完先和 peer 打招呼，再重启 `:3200`（kill 父进程及其 worker，确认端口释放，再 detached 启动，最后核对监听的 PID）。
8. [ ] 文档页实测：在 ego 打开 `/docs/dev/components/prism-glow` 截帧，暗色、亮色各一套；侧边栏与画廊的跳转也要验。

## Validation

```bash
# tuffex（直接调二进制，不走 pnpm run）
cd packages/tuffex
VITEST=$(ls -d ../../node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs | head -1)
node "$VITEST" run packages/components/src/prism-glow packages/components/src/__tests__/suite-barrels.test.ts packages/components/src/__tests__/global-install.test.ts
../../apps/core-app/node_modules/.bin/eslint packages/components/src/prism-glow   # 或 tuffex 自己的 eslint 入口
# 类型检查：tuffex 包的 vue-tsc 入口（实现时按 package.json 查实际命令，直接调 bin）

# nexus
cd ../../apps/nexus
node build/check-demo-registry-orphans.mjs && node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs
node "$VITEST" run test/docs/tuffex-component-docs-coverage.test.ts
```

- 颜色字面量扫描：在编译后的 CSS 上 grep `#[0-9a-f]{3,8}` / `rgba?\(`，只允许出现在 `var(--tx-…, #…)` 的 fallback 里。
- 不跑 `pnpm install` / `pnpm run typecheck` / `nuxt typecheck`，这些会拖垮共享的 `:3200`，见 `tuffex-docs-sync.md`。

## Rollback

- 删除 `prism-glow/` 目录，撤掉各注册点里本任务加的那一行，删除两个 demo 和两页文档。
- 提交只暂存本任务的行。共享文件用"HEAD blob 锚点编辑 + `git update-index --cacheinfo`"，不用 `-U0` 子集补丁。
