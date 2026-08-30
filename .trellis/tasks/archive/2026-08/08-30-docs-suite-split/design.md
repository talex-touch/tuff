# 技术设计 — 三套件重构与 tuffex 分包

## 总体机制

**套件不新增数据源**：frontmatter `category` 仍是唯一事实来源；套件由 `DocsSidebar.vue` 内的静态映射 `CATEGORY_SUITE_MAP: Record<category, 'base'|'pro'|'ai'>` 派生。`/api/docs/sidebar-components/` 与 server 端零改动。新增 category 值（Advanced/Visualization/AiChat/AiAgent/AiReasoning/AiContext）自然通过现有 API 流到客户端。

## 1. 分类落地（子任务 suite-taxonomy）

- `apps/nexus/scripts/recategorize-component-docs.py` 的 `TAXONOMY` 重写为 prd.md 归属总表（含组内顺序）。脚本重跑，改动仅落在各 `*.{zh,en}.mdc` 的 `category:` 行。
- hub `index.{zh,en}.mdc`：重组为 基础组件/进阶套件/AI 套件 三个 H2 章节、分类作 H3，**每个 slug 的链接必须保留**（coverage 测试 `linkTargetsFor` 用 markdown 链接正则解析 hub，缺一个 slug 即红）。zh/en 章节数与链接集合对等。
- `ai-suite.{zh,en}.mdc` 调整为 AI 套件落地页口径（标题/导语微调即可，不重写正文）。

## 2. 侧边栏（子任务 sidebar-suite-tabs）

`apps/nexus/app/components/DocsSidebar.vue`：

- **一级 tab（组件/扩展）**：现 `TOP_SECTIONS` 渲染处，胶囊样式（`bg-white shadow-sm` 等）改为下划线 tab：透明背景、`border-bottom: 2px` 激活指示（或绝对定位指示条）、激活 `text-black dark:text-white`、未激活 `text-black/45 dark:text-white/45`；保留图标。sticky 头保留。
- **二级套件切换**：`SUITES` 常量 = `[{key:'base', label:t('docsSidebar.suites.base'), categories:[...], standalonePages:[foundations, utils]}, {key:'pro',...}, {key:'ai', standalonePages:[ai-suite],...}]`（categories 数组即现 `COMPONENT_CATEGORY_ORDER` 按套件拆开）。仅 `activeTopSection==='components'` 时渲染，样式同为下划线但字号/粗细弱一档。
- **激活套件状态**：`selectedSuite = ref<'base'|'pro'|'ai'|null>(null)`（手动点击设置）；`activeSuite = computed(() => selectedSuite ?? suiteOfRoute ?? 'base')`，其中 `suiteOfRoute` 由当前路由 slug 在 `componentItems` 里的 category 经 `CATEGORY_SUITE_MAP` 得出。路由变化时清空手动选择（回到跟随路由），避免「点了 AI 又跳到基础组件文档但列表还停在 AI」的错位。
- **渲染**：`resolvedComponentSections` 增加按 `activeSuite` 过滤：只对该套件的 categories 建组、只显示该套件的 standalone 页；index 链接（组件总览）恒显。`misc` 兜底组保留（canary：分类漏网时可见）。
- **hydration 红线**：文件内现有注释明确「不能用 pending 门控节点」；二级切换同理——`suiteOfRoute` 依赖 `componentItems`（client-only lazy fetch），SSR 与首帧 client 都是空 → `activeSuite` 首帧恒为 `selectedSuite ?? 'base'`……注意：直接进入 AI 组件文档 URL 时首帧显示 base 列表、数据到达后跳到 ai，属可接受的渐进填充（与现有 sections 从空到有一致），但**不得**用仅 client 可知的状态改变 SSR 输出结构。
- **i18n**：`docsSidebar.suites.{base,pro,ai}`（基础/进阶/AI；Basics/Advanced/AI）、`docsSidebar.categories.{advanced,visualization,aiChat,aiAgent,aiReasoning,aiContext}`（高级交互/可视化/对话/智能体/推理与生成/上下文与洞察）。en/zh 两个 locale 文件都要加（`apps/nexus/i18n/locales/{zh,en}.ts`）。

## 3. tuffex 三入口（子任务 tuffex-suite-entries）

- 新增 `packages/tuffex/packages/components/src/{base,pro,ai}/index.ts`：纯 re-export barrel，成员 = prd 归属总表 ∩ components.ts 实际导出（按组件目录 re-export：`export * from '../button/index'` 形式，沿用 components.ts 的写法与别名处理）。
- **不改 package.json exports**：现有 `./*` 通配符（`./dist/es/*/index.js` + types + `./*/style.css`）在构建产出 `dist/{es,lib}/{base,pro,ai}/index.js` 后自动覆盖三入口。构建端确认 gulp/vite 入口发现机制包含新目录（若入口是显式清单则补上）。
- 样式：barrel 不引样式（与主入口行为一致，样式按需或全量 `style.css`）；文档写明 `import '@talex-touch/tuffex/style.css'` 不变。
- 守卫：`audit:exports`、`audit:types`、`audit:readme`（README 分类行是否需要提及三入口——只加使用说明，不动分类清单结构）、`components.ts` 不动。
- 一致性校验：写一次性 node 脚本（或测试）断言 base∪pro∪ai == components.ts 导出集且两两不相交；放 `packages/tuffex/scripts/` 或测试目录，进 CI 的 `test` 由子任务定夺。
- 文档：nexus `getting-started/tuffex-composition`（或组件 hub）补三入口 import 示例。

## 执行顺序与依赖

suite-taxonomy →（sidebar-suite-tabs 依赖新 category 数据）→ tuffex-suite-entries（依赖归属总表，代码上独立）。三者共用 prd.md 归属总表，任何调整先改表再改实现。

## 风险与对策

- **并发会话**（当前有 3+ 会话写库）：验证一律 `git show HEAD:path`，不 stash/checkout；提交用 stage+commit 一步；动手前 `git status` 看目标文件是否被他人改动。
- **coverage 测试**：hub 重组后先本地跑 `pnpm -C apps/nexus test`，红了按测试要求修（链接正则、Props 标题等约束见测试源码）。
- **en/zh 结构对等**：hub 与 i18n 同步双语改。
- **tuffex 构建入口发现**：若 `packages/script/build` 是按目录扫描则零改动；若显式清单需补三项。构建后 `ls dist/es/{base,pro,ai}` 验证。
- **回滚**：三个子任务各自独立可回滚（taxonomy=脚本重跑回旧表；sidebar=单文件 revert；tuffex=删三目录）。
