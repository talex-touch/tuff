# Implement — Nexus 基础套件画廊整改 + 文档侧栏重设计

按顺序执行；每一步完成后在 ego 浏览器（TaskSpace 2，:3200）里看到结果再进入下一步。需求编号见 `prd.md`，方案见 `design.md`。

## 0. 开工前

- [ ] `git diff --stat -- <本任务目标文件>`：确认并行会话在这些文件里的未提交改动，只在自己的区域下刀；不 stash / checkout / restore。
- [ ] 目标文件：`apps/nexus/app/components/{DocsSidebar.vue,docs/DocSection.vue,docs/TuffexDocsHeroBackground.vue,docs/DocsComponentsGallery.vue,docs/DocsComponentsGallery.css}`、`apps/nexus/i18n/locales/{zh,en}.ts`、`packages/tuffex/packages/components/src/{stat-card,empty-state,layout-skeleton}/**`、对应 `content/docs/dev/components/*.mdc`。

## 1. R2 `.dark` 泄漏（先做，影响后续所有暗色截图）

- [ ] 修复前截图：组件文档页顶部 hero 背景（暗色）。
- [ ] `TuffexDocsHeroBackground.vue:195–217` 四组 `:global(.dark) X` / `:global([data-theme='dark']) X` 改为 `.dark X` / `[data-theme='dark'] X`。
- [ ] 验证：真实导航进入组件文档页后，`html` 的 `backgroundImage === 'none'`、`boxShadow === 'none'`；样式表中不再有来自该文件、选择器恰为 `.dark` / `[data-theme="dark"]` 的规则；MarkdownView 根节点无径向渐变；AI 套件页 Chat / StreamMarkdown 抽查。
- [ ] 修复后 hero 截图对比；观感明显变差则按 design §1 退回方案删除这 4 组规则。
- 回退点：该文件单独还原。

## 2. 画廊样品（nexus，只动 base 区域）

- [ ] R3 Container：两行 `TxRow` + `.docs-gallery__rows`。
- [ ] R4 MarkdownView：`.docs-gallery__doc` 文档框、locale 化的 `markdownSample`、13px 与列表缩进的局部规则。
- [ ] R5 SortableList：新行结构（手柄 / 着色图标方块 / 名称 / `TxKbd`），去掉 `.docs-gallery__scroll-row` 复用。
- [ ] R7.2 状态格：`statusStates` 增加每项 `props`（中英标题 + 说明，ErrorState 加 `primaryAction`）与 `blockClass`；模板 `v-bind="state.props"`。
- [ ] R6 样品：`icon-class` 带着色类 `.docs-gallery__stat-icon`。
- [ ] 新 CSS 规则放在 base 相关规则附近（不追加到文件末尾）。
- [ ] 截图：base-suite 画廊 Container / MarkdownView / SortableList / 12 个状态格（暗色），亮色抽查。
- 回退点：画廊两文件中本任务的 hunk。

## 3. tuffex 组件（R6 / R7.1 / R8）

- [ ] R6 `TxStatCard.vue`：右下角裁切大图标、灰色判定关闭光晕、删除 `__decoration-icon`、hover 改为即时描边 + 位移 + 光晕 opacity、涨幅胶囊与内联 SVG 默认图标、reduced-motion。
- [ ] R7.1 `TxEmptyState.vue`：error 插画（窗口 + danger 角标 + 脉冲环动画 + reduced-motion 静帧）。
- [ ] R8 `TxLayoutSkeleton.vue`：优先级修正、顶栏 / 侧栏 / 内容区重排，类名与数量不变。
- [ ] 更新单测：`stat-card.test.ts`（默认涨幅图标断言改为内联 SVG；新增"涨幅文本为整体""灰色图标不出光晕"）、`layout-skeleton.test.ts`（保持现有断言通过，必要时补"具体条高度不被通用规则覆盖"的源码断言）、`empty-state` 相关测试（error 插画结构 + reduced-motion 规则存在）。
- [ ] 跑测：在 `packages/tuffex` 下 `node ../../node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run packages/components/src/{stat-card,empty-state,error-state,layout-skeleton}`（路径用 `ls -d` 解析出的实际版本目录）；再跑 `src/__tests__/shadow-light-source.test.ts` 与 motion-contract 相关测试。
- [ ] 文档同步（design §4.4）：stat-card / empty-state / error-state / layout-skeleton 的 zh + en；逐个确认其余命名这些组件的页面无行为性描述需改；新增 demo 则登记 `demo-registry.ts`。
- [ ] 构建 dist：`mkdir /tmp/tuffex-build.lock && (cd packages/tuffex && node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts); rmdir /tmp/tuffex-build.lock`（锁已被占用则等待，不抢）。
- [ ] `pnpm -C packages/tuffex audit:size`（体积门禁）与 `audit:cursor`。
- [ ] 截图：base-suite 画廊 StatCard / ErrorState / LayoutSkeleton（暗 + 亮）；stat-card、error-state、layout-skeleton 文档页 demo；StatCard 用 core-app 同款传参（`i-ri-* text-6xl text-[var(--tx-color-*)]`）的渲染抽查。
- 回退点：三个组件目录与其 mdc 各自独立还原，还原后需重建 dist。

## 4. R1 侧栏

- [ ] `DocsSidebar.vue` 模板：替换两排 tab 块为分段控件 + `TxDropdownMenu` 切换器。
- [ ] 脚本：`activeSuiteDef` 之后新增 `SUITE_ICONS`、`suiteDocCounts`、`suiteDescription`、`suiteMenuOpen`、关闭后焦点回触发器；不改 `SUITES` / `SECTION_ORDER` / `suiteOverviewLink` / `selectSuite`。
- [ ] 样式：删除 `.docs-tab-row*` / `.docs-tab-link*`，新增分段控件 / 触发器 / 浮层行样式；`.docs-nav-link` active 态（强调条 + 浅底）。
- [ ] `DocSection.vue` 样式：page 链接与 nav-link 同款 active 态；分组间距。保留测试钉住的模板字符串。
- [ ] i18n 追加：`docsSidebar.suiteSwitcher`、`docsSidebar.suiteDescriptions.*`（zh + en）。
- [ ] 确认新用到的 carbon 图标存在：`node build/check-icon-collections.mjs`，并在浏览器里看到图标实际渲染。
- [ ] 截图：中英 × 亮暗 × {Concepts、Basics 页}；键盘：Tab 到触发器 → Enter 打开 → 方向键 → Enter 选择跳转 → 再次打开 Esc 关闭且焦点回到触发器；点击外部关闭；移动端抽屉（窄视口）里切换器可用。
- 回退点：`DocsSidebar.vue` / `DocSection.vue` / i18n 中本任务的 hunk。

## 5. 收尾验证

- [ ] 控制台：画廊页、侧栏交互过程中无新增 error。
- [ ] nexus：`node <vitest.mjs> run app/pages/docs/docs-page-performance.test.ts`；`node build/check-demo-registry-orphans.mjs`、`node build/check-mdc-fences.mjs`、`node build/check-doc-translation-parity.mjs`。
- [ ] eslint 分包跑（不在根目录跑）：`apps/nexus` 与 `packages/tuffex` 各自对改动文件执行 `node <eslint.js> <files>`。
- [ ] `git diff --check`。
- [ ] 不跑 `pnpm typecheck` / `nuxt typecheck` / core-app `typecheck:web`（会杀掉 :3200）；如需类型检查，只跑 `packages/tuffex` 的 `vue-tsc --noEmit -p tsconfig.json` 直连入口。
- [ ] 不 commit；向老板汇报并附截图。报告里列出：`UpdatesAllView.vue:443–447` 同类泄漏未修。
