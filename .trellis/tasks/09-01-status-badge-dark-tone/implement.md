# Implement — status-badge 暗色 token 与图标家族

文件：
- `packages/tuffex/packages/components/style/variables.scss`（`.dark` 块）
- `packages/tuffex/packages/components/src/status-badge/src/TxStatusBadge.vue`
- `packages/tuffex/packages/components/src/status-badge/__tests__/status-badge.test.ts`
- `apps/nexus/content/docs/dev/components/status-badge.{zh,en}.mdc`、`foundations.{zh,en}.mdc`

## 顺序

1. **先截"改前"暗色基线。** 用父任务 `research/shoot.mjs`（`MODE=dark`）把画廊全页截一张 + StatusBadge / Badge / Tag / Alert / Toast / Button / Steps / Timeline / StatCard / VersionCapsule 各格子截图存 `research/before/`。没有基线就没法说"没变差"。

2. **先写会红的测试**（见下），跑一遍确认红。

3. **token**：`.dark` 块在 `--tx-color-on-primary` 之后、文字色之前插入三枚 token（与 `:root` 的顺序一致）；更新第 359–362 行的 `-rgb` 三元组。`rg "danger-light-" packages/tuffex/packages/components/src` 决定 `--tx-color-danger-light-*` 的处理。

4. **组件**：`toneMap` 两处图标；style 块圆角 / 字重 / 图标尺寸 / 内边距。

5. **build tuffex，截"改后"**（同一脚本、同一批格子）存 `research/after/`，逐格并排比对，写签收表进 `research/measurements.md`。danger 在 `#f87171` / `#fb7185` 之间实机定，定完回填 design.md。

6. **抽查下游**：nexus `/store`、`/dashboard/devices`、`/dashboard/storage` 各看一眼 status badge。

7. **文档**（见下）。

## 测试

`status-badge.test.ts` 新增：

- 五个 `status` 各挂载一次，断言 `.tx-status-badge__icon` 的 class 命中 design.md 映射表；success 那条在改前必红（现在是 `checkmark-filled`）
- 源码断言（`fs.readFileSync` 读 `TxStatusBadge.vue`）：`&__icon` 块含 `font-size: 1em`，根块含 `border-radius: 999px`、`font-weight: 500`；用括号匹配取块，不用跨块正则

新增 `packages/tuffex/packages/components/src/status-badge/__tests__/dark-semantic-tokens.test.ts`（放在既有 include 范围内，先看 `packages/tuffex/vitest.config.*` 的 include，别新开目录）：

- 读 `../../../../style/variables.scss`，用括号匹配取 `.dark {` 块与 `:root {` 块
- 阳性对照：两块都非空，`:root` 块含 `--tx-color-success:`
- `.dark` 块含 `--tx-color-success:` / `--tx-color-warning:` / `--tx-color-danger:` 三行（改前红）
- 三枚 hex 解析成 RGB 后与同块内 `--tx-color-*-rgb` 三元组逐位相等
- 三枚新值对 `#141414` 的对比度 ≥ 7（把 design.md 的约束写成断言，防以后有人随手改成一个不及格的值）

⚠️ 每条先红后绿；不要把当前值快照进断言。

## 文档同步

无 wrapper（`rg -l "\.\./\.\./status-badge'"` 为空）。

`status-badge.{zh,en}.mdc`：
- `## 交互契约` 里 `statusKey` 映射那条之后加一条"默认图标：success `checkmark-outline`、warning `warning`、danger `close-outline`、info `information`、muted `circle-dash`，同为描线圆家族；`icon` 可覆盖"。
- `## 审阅说明`：实测覆盖句加"五个色调的默认图标映射、胶囊圆角与 1em 图标"；组件源码那条把"OS 图标映射、`osOnly`"后面补"描线图标家族"。覆盖句保持段末。

`foundations.{zh,en}.mdc`：第 44–46 行 Dark 列三个 swatch 的 `--swatch:` 与 `<code>` 改为新 hex。

`## Demo` 无需新增：视觉变化在既有三个 demo 里直接可见，实机看 `StatusBadgeSignalsDemo` / `StatusBadgeRowDemo`。

## 验证命令

```bash
cd packages/tuffex && node $(ls -d ../../node_modules/.pnpm/vitest@*/node_modules/vitest | head -1)/vitest.mjs run packages/components/src/status-badge
cd packages/tuffex && node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts
cd packages/tuffex && pnpm audit:size     # 读 dist；红了就是本次的，重新量
# nexus typecheck 内含 `nuxt prepare`，会重生成运行中服务器的 .nuxt 并把它打成 503：
# 只在 :3200 停掉时跑，集成阶段统一一次。
cd apps/nexus && pnpm typecheck 2>&1 | grep "error TS" || echo "nexus typecheck clean"   # 服务器停掉后再跑
# core-app：分开跑两条。`npm run typecheck` 的 typecheck:web 会先无锁重建 tuffex dist，
# 会打掉别人的 dist 并让 nexus dev（从 dist 解析 tuffex）进入 503；集成阶段再统一跑。
cd apps/core-app && npx tsc --noEmit -p tsconfig.node.json --composite false
cd apps/core-app && node $(ls -d ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc | head -1)/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false
cd apps/nexus && node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs
```

## 回滚点

token（步骤 3）与组件（步骤 4）互相独立，可单独还原；步骤 5 的签收表是继续与否的门。
