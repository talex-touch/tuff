# Implement — `TxStatusHint` 与 CoreBox 操作反馈

按顺序执行；每一段末尾是这一段的验证与回滚点。技术细节以 `design.md` 为准，视觉参数以
`research/visual-calibration.md` 为准（原型 `research/status-hint-prototype.html` 里的 CSS 可以直接对照）。

## 0. 开工前

- [ ] `git status --short`：确认只有本任务的 Trellis 文件是新的；有别的 agent 在写同一仓库时，
      验证一律按文件做（`git show HEAD:<path> > <path>`），不用 stash / checkout。
- [ ] 看一眼是否有别人的 dev 进程：`lsof -iTCP:3200 -sTCP:LISTEN`（Nexus）、`lsof -iTCP:5173 -sTCP:LISTEN`（CoreApp）。
      有的话不要在 `apps/nexus` 跑 `nuxt typecheck` / `nuxt prepare` / 任何 `pnpm <script>`，也不要让 tuffex dist 长时间处于清空状态。
- [ ] corepack 垫片（Node 26 没有 corepack，tuffex 构建与 CoreApp `typecheck:web` 都写死了 `corepack pnpm`）：
      `/tmp/corepack-shim/corepack` 不存在就按记忆里的两行脚本建，用时 `PATH=/tmp/corepack-shim:$PATH`。
- [ ] 不用 `pnpm <script>` 包装层（会先触发全量 install）；直接调各包自己的 `node_modules/.bin/*` 或 `node scripts/*.mjs`。
      不在命令前加 `timeout`（macOS 没有，会让整条命令静默失效），超时用工具参数。输出重定向到文件，读命令自身的退出码。

## 1. TuffEx 组件

- [ ] `packages/tuffex/packages/components/src/status-hint/src/types.ts`：`StatusHintSize = 'sm' | 'md'`、`StatusHintProps`
      （`tone` 用 `import type { StatusTone } from '../../status-badge/src/types'`，不在本目录重新导出，避免桶里同名类型被静默丢弃）。
- [ ] `status-hint/src/TxStatusHint.vue`：按 `design.md` §2 实现。
  - `defineProps({...} satisfies Record<keyof StatusHintProps, unknown>)`。
  - 相对路径引入 `TxTextTransformer`（`../../text-transformer/src/TxTextTransformer.vue`）、`TxIcon`（`../../icon`）、
    `resolveTransition`（`../../liquid/src/spring`），不带 `.ts` 扩展名。
  - `watch([() => props.text, () => props.pulseKey])` 翻转 `pulse`；`animated=false` 时不翻转。
  - `<style lang="scss" scoped>`：动画全部在 `@media (prefers-reduced-motion: no-preference)` 内、挂在 `.is-animated` 下；
    暗色覆盖写成 `:is([data-theme='dark'], .dark) .tx-status-hint`；每个 `var()` 带兜底。
- [ ] `status-hint/index.ts`：`withInstall`，导出 `StatusHint`、`TxStatusHint`、`StatusHintProps`、`StatusHintSize`、
      `TxStatusHintInstance`，JSDoc 照 `mode-chip/index.ts`。
- [ ] 注册：`src/components.ts`（`status-badge` 之后）、`src/base/index.ts`（`status-badge` 之后）。
- [ ] `packages/tuffex/README.md` / `README_ZHCN.md`：`Feedback (13)` / `反馈 (13)` → 14，`status-hint` 插在 `alert` 后；
      模块总数 160 → 161。
- [ ] 测试：`status-hint/__tests__/status-hint.test.ts`、`status-hint/__tests__/status-hint-motion.test.ts`（清单见 `design.md` §5）。

验证：

```sh
cd packages/tuffex
./node_modules/.bin/vitest run packages/components/src/status-hint packages/components/src/__tests__/suite-barrels.test.ts
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.json                              # 阳性对照：临时埋一个类型错误确认会报
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.json --noUncheckedIndexedAccess   # Nexus 严格度代理
./node_modules/.bin/eslint packages/components/src/status-hint packages/components/src/components.ts packages/components/src/base/index.ts
node scripts/audit-readme-inventory.mjs && node scripts/audit-prop-vocabularies.mjs
```

（`.bin` 垫片失效时按记忆 `stale-bin-shims-after-repo-move` 直接调 `.pnpm` 里的入口。）
回滚点：本段全部是新增文件，外加 4 处注册行。

## 2. TuffEx 构建与体积门禁

- [ ] `PATH=/tmp/corepack-shim:$PATH node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`（在 `packages/tuffex`）。
      构建会先清空 dist；完成后 `ls dist/es | wc -l` 应比原来多 1，`dist/es/status-hint/style.css` 存在。
- [ ] 确认新样式表只含 `.tx-status-hint*` 规则（没有内联 `TxTextTransformer` / `TxIcon` 的样式）。
- [ ] `node scripts/audit-package-size.mjs`：全量 / 按需 CSS 预算大概率超出。超出时在 `LIMITS` 按惯例上调，
      写带日期的说明（归因到新样式表、实测值、「actuals plus minimal headroom」），和组件放在同一个提交。
- [ ] `node scripts/audit-package-exports.mjs`、`node scripts/audit-package-types.mjs`。

## 3. Nexus 文档与 demo

可以交给一个 `trellis-implement` 子 agent 做（提示词首行写 `Active task: <task.py current 的路径>`），
前提是第 1、2 段已经完成。

- [ ] `apps/nexus/content/docs/dev/components/status-hint.{zh,en}.mdc`
  - frontmatter 8 个字段，顺序为 `title` / `description` / `category: Feedback` / `status: beta` / `since: 0.6.0` /
    `tags` / `syncStatus` / `verified`。`since` 取时间上最近的同批组件：`prism-glow`、`choice-card`、`fusion-surface`
    于 2026-09-26 加入，均为 `0.6.0`。
  - 结构照 `mode-chip.{zh,en}.mdc`；覆盖契约要求 `## API`、以 `Props` / `属性` 结尾的标题、`Best Practices` / `最佳实践`，
    以及可解析的 `TuffDemoWrapper`；英文标题 Title Case；中英文 `##` 数量一致。
  - 内容：基础用法（成功/失败切换 + 同文案重放）、色调、尺寸与摆放（`--tx-status-hint-radius` / `-pad-x` 覆盖）、
    `animated` 与 `live` 的宿主职责、离场过渡用法、CSS 变量表、最佳实践（短文案、只放一行、宿主拥有播报区时关掉 `live`）。
- [ ] demo：`app/components/content/demos/StatusHintStatusHintDemo.vue`、`StatusHintTonesDemo.vue`
      （必要时再加一个摆放 demo），登记到 `app/components/content/demo-registry.ts`。
- [ ] `apps/nexus/scripts/recategorize-component-docs.py` 的 `Feedback` 列表、`app/components/DocsSidebar.vue` 的
      `SECTION_ORDER`：都插在 `alert` 后，两处顺序一致。
- [ ] Hub `index.{zh,en}.mdc`：反馈分组插在 Alert 后；「套件总览」里基础套件计数 92 → 93。

验证：

```sh
cd apps/nexus
node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs && node build/check-demo-registry-orphans.mjs
python3 scripts/recategorize-component-docs.py --check
./node_modules/.bin/vitest run          # CI 同款；前提是第 2 段的 tuffex build 是新鲜的
```

- [ ] 页面实看：沿用 ego TaskSpace 19。`:3200` 已有 dev 服务就直接用，否则按记忆 `nexus-pnpm-wrapper-kills-dev-server`
      的配方起一个；看 `/zh/docs/dev/components/status-hint` 与英文页的 demo 渲染和亮暗主题。

## 4. CoreApp 接入

- [ ] 新建 `apps/core-app/src/renderer/src/components/render/CoreBoxActionFeedback.vue`（`design.md` §3），
      `import { TxStatusHint } from '@talex-touch/tuffex/status-hint'`（按需子路径，不从根入口引入，`audit:size` 会查根入口）。
- [ ] `CoreBoxFooter.vue`：`animated` prop；`.FooterInfo` 分支条件；反馈改为底栏直接子节点，外包 `<Transition name="tx-status-hint">`，
      不设 `:key`；删除 `.FooterFeedback*` 旧样式。
- [ ] `CoreBox.vue`：`<CoreBoxFooter :animated="shouldAnimate()">`；顶栏换成封装组件（同样外包 Transition、不设 key）；
      删除 `.CoreBox-ActionFeedback-Icon` / `-Text` 旧样式，布局规则并入封装。
- [ ] 测试：`render/CoreBoxFooter.feedback.test.ts`、`box/CoreBox.search-status.test.ts` 按 `design.md` §5 更新，
      补 AC2 / AC3 / AC5 的断言。

验证：

```sh
cd apps/core-app
./node_modules/.bin/vitest run src/renderer/src/components/render/CoreBoxFooter.feedback.test.ts \
  src/renderer/src/views/box/CoreBox.search-status.test.ts src/renderer/src/modules/box/adapter/hooks/useActionPanel.test.ts
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false            # typecheck:node 同款
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false         # typecheck:web 去掉前置的 tuffex 重建（第 2 段刚建过）
./node_modules/.bin/eslint <改动的文件>                                              # 包内配置；判 delta，不整文件 --fix
node <prettier 入口> --check <改动的文件>
```

- [ ] 反向验证：把新增断言对着 `git show HEAD:` 的旧组件跑一次，确认它们在旧实现上会失败（不是天然成立的断言）。

回滚点：CoreApp 改动集中在 3 个源文件 + 2 个测试文件，按文件用 `git show HEAD:<path> > <path>` 还原。

## 5. 真机验证（AC1）

- [ ] 确认 `dist/es/status-hint/style.css` 是新鲜的（CoreApp dev 从这里解析组件样式）。
- [ ] 起隔离的 CoreApp dev 实例（记忆 `tuff-dev-cdp-verification-gotchas` / `corebox-cdp-search-harness`）：
      `TUFF_DEV_SERVER_PORT=<空闲端口> TUFF_DISABLE_GLOBAL_SHORTCUTS=1`，透传
      `--disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`
      和远程调试端口；CDP 脚本都加进程级超时守卫。
- [ ] 通过 CDP 打开 CoreBox，搜出结果，经结果列表快捷键路径（`COREBOX_META_ACTION_EVENT`）触发真实的
      `toggle-pin` 两次（得到「已固定 → 已取消固定」的 morph）、`copy-title` 两次（同文案重放），
      再触发一个不支持的动作拿到失败态。
- [ ] 亮、暗主题各截：入场过程（按时间间隔连拍）、静止态、失败态；插件 UI 模式下顶栏那份各一张。截图写 `/tmp`。
- [ ] 按端口定位 PID 停掉实例（不用 `pgrep -f` 模式匹配，会误杀 Electron Helper）。

## 6. 收尾（Phase 3）

- [ ] spec：`corebox-results-contracts.md` › Action feedback placement（组件、保持挂载、重放、总闸、morph 宽度动画的例外）；
      `tuffex-text-motion.md` › What each component uses 加 `TxStatusHint` 一行。
- [ ] 全量复核：第 1–4 段的验证再跑一遍；`git diff --check`。
- [ ] 提交前先问老板（全局约定：没有明确要求不 commit）。提交时只暂存本任务的路径；预算上调和组件放同一个提交。
- [ ] ego TaskSpace 19 `finish({ keep: [] })`；停掉原型用的 `http.server :7791`。
