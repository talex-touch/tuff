# Implement — tuffex 文本形变引擎

上游源码已 clone 到 `/tmp/torph-src`（`git clone --depth 1 https://github.com/lochie/torph`）。若不在，先重新 clone。

## 阶段 0 · 基线

- [ ] 0.1 记录基线：`pnpm -C packages/tuffex typecheck`、`pnpm -C packages/tuffex test`、`pnpm -C packages/tuffex lint` 各自当前的错误/告警数（lint 判 delta 不判零）。
- [ ] 0.2 `pnpm -C packages/tuffex build` 跑一次，确认 `dist/` 是新的（`audit:size` 读 dist）。

## 阶段 1 · 引擎移植

顺序按依赖自底向上，每步 typecheck 可过再进下一步。

- [ ] 1.1 `text-morph/src/engine/constants.ts` — 前缀 `tx-morph-*`。
- [ ] 1.2 `engine/types.ts` — `MorphSegment` / `MorphSegmentKind` / `TextMorphEngineOptions` / `MORPH_DEFAULTS`。
- [ ] 1.3 `engine/lcs.ts` — 直译。
- [ ] 1.4 `engine/number.ts` — 位值 / 光标匹配。**逐行核对**：`MAGNITUDE_JUMP = 3`、`CORE_SEPARATORS`、`PREFIX_CHARS`/`SUFFIX_CHARS`、`isNumericWord` 的严格性（`COVID-19` 不能被当数字）。
- [ ] 1.5 `engine/segment.ts` — `Intl.Segmenter` + fallback + ID 分配器。
- [ ] 1.6 `engine/diff.ts` — 词级 LCS → 精确重排 → 相似度配对 → 计划表。`MIN_SIMILARITY = 0.4`、`MAX_MORPH_PAIRINGS = 2500`、`MAX_LCS_CELLS = 1e6` 原样保留。
- [ ] 1.7 `engine/reduced-motion.ts` — 裸 `matchMedia` 监听器，`typeof window === 'undefined'` 短路。
- [ ] 1.8 `engine/flip.ts` — 段级测量 + `computeDelta` + `findNearestAnchor` + `resolveExitingAnchors`。
- [ ] 1.9 `engine/dom.ts` — `createItem` / `detachFromFlow` / `splitWordSpans` / `syncSlot` / `moverOf` / `reconcileChildren`。
- [ ] 1.10 `engine/container.ts` — 容器宽高过渡 + `carry` + `sampleEasing` + 本地 `slopeAt`；缓动求值改用 `easingFunction`（见 design §3，写注释标注 null 语义差异）。
- [ ] 1.11 `engine/animate-text.ts` / `animate-number.ts` / `animate-group.ts` — 三个进退场模块。常数原样：`GROUP_MIN = 6`、`GROUP_SCALE = 0.8`、各 fade 比例。
- [ ] 1.12 `engine/morph.ts` — 编排类 `TextMorphEngine`。删掉 `addStyles`/`removeStyles` 调用；`resolveEase` 换成 `resolveTransition`。
- [ ] 1.13 `engine/controller.ts` — `MorphController`，`serializeConfig` 里的字段跟着新 options 名调整。
- [ ] 1.14 `engine/index.ts` — 桶导出。
- [ ] 1.15 每个移植文件顶部加 MIT 出处头注释（体例抄 `liquid/src/spring.ts` 前 5 行）。
- [ ] 1.16 `vue-tsc --noEmit` 过 —— `noUncheckedIndexedAccess` 会在数组索引处大量报错，逐个加 `!` 或守卫（上游本来就写了 `!`，主要是新拆出的边界）。

## 阶段 2 · `TxTextMorph` 组件

- [ ] 2.1 `text-morph/src/types.ts` — `TextMorphProps`（design §5）。
- [ ] 2.2 `text-morph/src/TxTextMorph.vue` — `<script setup>` 壳：`MorphController` + `watch(text)` + `watch(configKey)` + `onUnmounted(destroy)`；首帧渲染纯文本保证 SSR 水合一致。
- [ ] 2.3 同文件 `<style lang="scss">`（**不 scoped**）落引擎 CSS（design §6，逐条含注释）。
- [ ] 2.4 `text-morph/index.ts` — `withInstall`。
- [ ] 2.5 `src/components.ts` 按字母序加 `export * from './text-morph/index'`。
- [ ] 2.6 `src/pro/index.ts` 加 `export * from '../text-morph/index'`（与 `text-transformer` 同套件；`suite-barrels.test.ts` 守卫并集）。
- [ ] 2.7 `README.md` + `README_ZHCN.md` 分类计数 `(N)` 与总数行（`audit:readme` 是门）。

## 阶段 3 · 改造现有组件

- [ ] 3.1 `text-transformer/src/types.ts` 加 `mode?: 'morph' | 'fade'`；注明 `blurPx` 仅 `fade` 生效。
- [ ] 3.2 `TxTextTransformer.vue`：morph 分支渲染 `<TxTextMorph>`；**检测到默认插槽强制退回 fade**；`wrap` 时覆盖 `white-space`。fade 分支逐像素不变。
- [ ] 3.3 `TxSwitch` 不改代码，只验证版式（morph 作为 flex item）。
- [ ] 3.4 `TxBadge.vue`：换 `TxTextMorph`，删 NumberFlow + 量宽管线 + `width 180ms` 过渡（design §8）。
- [ ] 3.5 验证 badge 的 `overflow: clip` 不削数字滑动；不行就走 §8 的两条回退之一。
- [ ] 3.6 从 `packages/tuffex/package.json` 与 `packages/components/package.json` 删 `@number-flow/vue`；`pnpm install`。
- [ ] 3.7 全仓 grep `number-flow` 归零（含 `stat-card.test.ts` 的陈旧 mock）。

## 阶段 4 · 测试

- [ ] 4.1 `text-morph/__tests__/engine.test.ts`：
  - 分段：`segmentText('hello world')` 词级、`segmentText('你好')` 字素级、fallback 分支；
  - diff：相同前缀复用 ID、整词替换走 morph 配对、`MIN_SIMILARITY` 以下不配对；
  - 位值：`1,204 → 1,318` 千位段 ID 不变而百/十位换新；`COVID-19` 不被当数字；量级跳 ≥3 位不携带；
  - 弹簧融合：`spring: 'snappy'` 解析出的 duration/easing 与 `resolveTransition` 一致（锁契约）；
  - reduced-motion：`matchMedia` 返回 `matches: true` 时直接写 `textContent`，且 `previousSegments` 被清空。
- [ ] 4.2 `text-morph/__tests__/text-morph.test.ts`：挂载冒烟、更新 `text`、`disabled`、卸载不泄漏。
- [ ] 4.3 更新 `text-transformer.test.ts`（新增 morph 默认 + slot 退回 fade 两条）、`badge.test.ts`、`switch.test.ts`。
- [ ] 4.4 jsdom stub：`element.animate` / `getAnimations` / `ResizeObserver`（`matchMedia` 在 `vitest.setup.ts` 已有）。
- [ ] 4.5 负控制：故意改坏一处断言，确认测试真的会红（见 `absence-scan-positive-control`）。

## 阶段 5 · nexus 文档

按 `tuffex-new-component-wiring` 的触点表走。**必须与 tuffex 导出同批落地**，否则 `tuffex-component-docs-coverage` 中间态就红。

- [ ] 5.1 `apps/nexus/scripts/recategorize-component-docs.py` TAXONOMY 加 `text-morph`（归 pro，与 text-transformer 同类）。
- [ ] 5.2 `app/plugins/tuffex.ts` 加 `fromTextMorph` loader + `TxTextMorph` 条目。
- [ ] 5.3 `app/components/content/demos/TextMorph*.vue` — 至少三个 demo：字符形变、数字位值（金额/计数器）、弹簧对照。
- [ ] 5.4 `app/components/content/demo-registry.ts` 注册。
- [ ] 5.5 `app/components/DocsSidebar.vue` `SECTION_ORDER` 同序加路由。
- [ ] 5.6 `content/docs/dev/components/text-morph.{zh,en}.mdc` — 8 字段 frontmatter，`status: beta`；行级精确的 `## API`、以 `Props`/`属性` 结尾的标题（写 `### TxTextMorph Props`，不写 `### Props（TxTextMorph）`）、`最佳实践`/`Best Practices`；zh/en 的 H2/H3 数量必须一致；正文不能写在 `<TuffDocSourceLink />` 之后。
- [ ] 5.7 `content/docs/dev/components/index.{zh,en}.mdc` 双语链接。
- [ ] 5.8 更新 `text-transformer.{zh,en}.mdc`（`mode` 属性 + slot 退回 fade 的说明）与 `badge.{zh,en}.mdc`（不再提 NumberFlow）。
- [ ] 5.9 `check:mdc-fences`。

## 阶段 6 · 验证

- [ ] 6.1 `pnpm -C packages/tuffex typecheck`
- [ ] 6.2 `pnpm -C packages/tuffex test`
- [ ] 6.3 `pnpm exec eslint --fix` **只对本次新增/修改的文件**（绝不整目录 fix；注意 `import type` 合并陷阱）
- [ ] 6.4 `pnpm -C packages/tuffex build` → `audit:exports` / `audit:types` / `audit:readme` / `audit:size`
- [ ] 6.5 `pnpm -C apps/nexus typecheck`（会重写 `.nuxt`，别和 dev server 同跑）
- [ ] 6.6 `pnpm -C apps/nexus test` ← **硬门**
- [ ] 6.7 实机：`nuxt dev --port 3201` + headless Chrome（`scripts/audit-cdp-client.mjs`，自己起 `--remote-debugging-port=9224`）截图 `text-morph` / `text-transformer` / `badge` / `switch` 四页；再用 CDP 的 `Emulation.setEmulatedMedia` 开 `prefers-reduced-motion: reduce` 复测一轮。

## 阶段 7 · 收尾

- [ ] 7.1 `.trellis/spec/frontend/` 记录两条契约：① 文本值变化一律走 morph 引擎；② 引擎的弹簧来自 `liquid/src/spring.ts`，不得再造第二套。
- [ ] 7.2 提交（commitlint 无 `refactor`，用 `feat`/`ref`）。仓库有并发 agent，用 `GIT_INDEX_FILE` 私有索引提交，别碰 `.git/index`。

## 回滚点

- 阶段 1-2 结束：只新增文件，`components.ts` 未改动前可整目录删除。
- 阶段 3.6（删依赖）之前：`git checkout` 两个 package.json 即可恢复。
- 阶段 5 开始后：tuffex 与 nexus 必须一起回滚，否则文档门红。
