# Implement — progress-bar 重设计

文件：
- `packages/tuffex/packages/components/src/progress-bar/src/TxProgressBar.vue`
- `packages/tuffex/packages/components/src/progress-bar/src/types.ts`
- `packages/tuffex/packages/components/src/progress/src/TxProgress.vue`（删一行）
- `packages/tuffex/packages/components/src/progress-bar/__tests__/progress-bar.test.ts`
- `apps/nexus/content/docs/dev/components/progress-bar.{zh,en}.mdc`、`progress.{zh,en}.mdc`
- `apps/nexus/app/components/content/demos/ProgressBarUploadDemo.vue` + `demo-registry.ts` 一行

## 顺序

1. **先写会红的测试**（见下），跑一遍确认全红，再动源码。

2. **types.ts**：`maskBackground` 加 `'none'`，`textPlacement` 加 `'top'`，新增 `detail?: string`（放在 `message` 之后，注释写明只在 `top` 下渲染）。默认值：`maskVariant: 'plain'`、`maskBackground: 'none'`。

3. **轨道**：`__mask` 加 `v-if="maskBackground !== 'none'"`（两份模板都改）；`__track` 加底色；`::after` 描边规则改为只在 `--mask-solid` / `--mask-dashed` 下生成。删 `.tx-progress-bar-wrapper--bg-*` 里针对 `none` 不需要的规则？——不删，`none` 不产生 class 即可。

4. **填充**：script 加 `fillBackground` computed（design.md「填充」），style vars 输出 `--tx-progress-fill`；删 `shadowColor` / `--tx-progress-shadow-color` 与 `.tx-progress-bar` 的 `box-shadow`。`hoverEffect: 'glow'` 的 `box-shadow` 保留但加注释说明被轨道裁剪（PRD 7）。

5. **光晕**：wrapper 内新增 `__glow`（两份模板），`showGlow` computed，样式与过渡按 design.md。

6. **过渡时长 / 曲线**：bar `width` 与 glow `left` 改 `480ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))`。

7. **关键帧搬到 transform**：按 design.md 表逐个改 5 个 `@keyframes`；`::before` 的 `left: 0` 静态值保留，只去掉动画里的 `left` / `width`。改完实机看 5 种变体各跑一圈（docs 页有 playground 的话直接切）。

8. **顶部文案行**：`showTopText` computed + `__head` 模板（两份）+ 样式；wrapper 在 `--text-top` 下改列布局。

9. **TxProgress.vue** 删 `mask-background="mask"`。

10. **文档 + demo**（见下）。

## 测试

`progress-bar.test.ts` 新增（沿用 slider 测试里的 `ruleBody` 括号匹配写法，不要用跨块正则）：

- 阳性对照：从源码提取到的 `@keyframes tx-progress-` 块 ≥ 5 个，每块非空
- 每个关键帧块内不含 `left:` / `width:`
- 默认挂载：无 `.tx-progress-bar__mask`；wrapper class 不含 `tx-progress-bar-wrapper--bg-blur`；含 `--mask-plain`
- `maskBackground: 'blur'` 时 `.tx-progress-bar__mask` 存在（opt-in 仍活）
- 默认 style 含 `--tx-progress-fill: linear-gradient(90deg`；`color: 'linear-gradient(90deg, #000, #fff)'` 时 `--tx-progress-fill` 原样等于该字符串
- `percentage: 40` 有 `.tx-progress-bar__glow` 且其父是 wrapper 而非 `__track`；`0` / `100` / `indeterminate` / 有 `segments` 时不渲染
- `textPlacement: 'top', showText: true, detail: '1.4 MB of 2.3 MB'` 渲染 `__head-label` 文本 `40%` 与 `__head-detail`；无 `detail` 时无 detail 节点；`indeterminate` + `top` 无 `message` 时不渲染 head
- 既有 `inside` / `outside` / segments / complete 用例不动

`TxProgress` 的测试（若有）：断言渲染出的 wrapper 不含 `--bg-mask`。

⚠️ 别把当前渲染结果快照下来当断言。每条先红后绿。

## 文档同步

触发 `.trellis/spec/frontend/tuffex-docs-sync.md`。wrapper 扫描：`rg -l "\.\./\.\./progress-bar'" packages/tuffex/packages/components/src` → `progress/src/TxProgress.vue`，所以 **四个 mdc 都要改**。

`progress-bar.{zh,en}.mdc`：
- `## Demo` 里新增 `### 上传进度` / `### Upload progress`，放在 `### 状态进度` 之后（同为"状态类"），不追加到末尾。demo 文件 `ProgressBarUploadDemo.vue`：模拟 0→100 的上传，`text-placement="top"`、`:format` 拼 "Uploading n%"、`detail` 拼 "x MB of y MB"，`onBeforeUnmount` 清定时器；`useI18n` + `copy` 双语，同邻居写法。`demo-registry.ts` 按字母序插一行。
- `### Props`：`textPlacement` 取值加 `'top'`；`maskVariant` 默认 `'plain'`；`maskBackground` 取值加 `'none'`、默认 `'none'`；`detail` 行紧跟 `message`。
- `## 交互契约`：文本显隐那条加 `top` 分支；新增一条"`detail` 只在 `top` 放置下渲染，且不进入可访问名"，放在文本规则旁。
- `## 最佳实践`：在"动效只用于高价值进度反馈"旁加一条：需要模糊 / 玻璃轨道时显式传 `maskBackground`，默认是平铺轨道。
- `## 审阅说明`：加实测覆盖：关键帧无布局属性、默认无遮罩节点、渐变填充、`top` 文案行。覆盖句保持段末。

`progress.{zh,en}.mdc`：第 66 行改为"底层进度条使用 `maskVariant="plain"`，轨道跟随 `TxProgressBar` 的默认样式"。

其它提到 `TxProgressBar` 的页面（`ComponentsOperationsStatusDemo` 等 5 个 demo 所在页）只是填充物，确认无行为性描述即可。

## 验证命令

```bash
cd packages/tuffex && node $(ls -d ../../node_modules/.pnpm/vitest@*/node_modules/vitest | head -1)/vitest.mjs run packages/components/src/progress-bar packages/components/src/progress
cd packages/tuffex && node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts
# nexus typecheck 内含 `nuxt prepare`，会重生成运行中服务器的 .nuxt 并把它打成 503：
# 只在 :3200 停掉时跑，集成阶段统一一次。
cd apps/nexus && pnpm typecheck 2>&1 | grep "error TS" || echo "nexus typecheck clean"   # 服务器停掉后再跑
# core-app：分开跑两条。`npm run typecheck` 的 typecheck:web 会先无锁重建 tuffex dist，
# 会打掉别人的 dist 并让 nexus dev（从 dist 解析 tuffex）进入 503；集成阶段再统一跑。
cd apps/core-app && npx tsc --noEmit -p tsconfig.node.json --composite false
cd apps/core-app && node $(ls -d ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc | head -1)/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false
cd apps/nexus && node build/check-demo-registry-orphans.mjs && node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs
```

实机：父任务 `research/shoot.mjs` 截画廊 ProgressBar 格子（dark / light）；另开 `/docs/dev/components/progress-bar` 与 `/progress` 两页看全部 demo；nexus `/dashboard/storage` 与 core-app 插件存储页各看一眼（core-app 需 `pnpm core:dev`）。

## 回滚点

步骤 3–6（轨道 / 填充 / 光晕 / 时长）为一组，步骤 7（关键帧）独立，步骤 8（文案行）独立，各自可单独还原。
