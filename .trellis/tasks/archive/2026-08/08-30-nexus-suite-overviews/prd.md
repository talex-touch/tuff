# nexus 五套件文档结构：Data 拆分、per-tab overview、Concepts 三组别

## 背景

#1817 后组件文档分四套件（concepts/base/pro/ai，DocsSidebar 客户端 tab 过滤，非路由）。老板 2026-08-30 依据截图提出三项：

1. Concepts 侧栏目前是三条裸链接（Tuffex Components / Design Foundations / Utils），要「展开三个组别分别讲一下」。
2. 「overview 要放到每一个 tab 的 index」。
3. 「拆分 Data 出来，数据相关的拆包」。

已向老板确认（AskUserQuestion）：单任务统管三项；overview 为**套件专属**（非同一份复用）；Data 作为**组件区第五个套件 tab**（顶层 UI/Ext 不动），tab 行为 Concepts/Basics/Advanced/AI/Data（顺序按确认文案，评审可调）。

## 需求

**R1 Data 第五套件**
- `SuiteKey` 增 `'data'`；categories `Visualization` + `Charts` 整体迁入（数据相关 = tuffex-charts 包 6 页 + spark-chart/allocation-bar/diff-table/signal-meter）；pro 剩 Advanced/Effects/Primitives。
- charts 总览页（charts.mdc）作 Data tab 的 overview 首项。
- `scripts/recategorize-component-docs.py` 的套件映射同步。
- i18n `docsSidebar.suites.data`（en `Data`、zh `数据`）。
- 注意：base 套件已有 **category** `Data`（分类层），与新套件同名不同层，不改动它。

**R2 套件专属 overview**
- 新增 `concepts-suite` / `base-suite` / `pro-suite` 三对 zh/en 页，沿 `ai-suite` 先例（frontmatter 与侧栏 standalonePages 机制照搬）。
- 每个 tab 首项 = 本套件 overview：concepts→concepts-suite、base→base-suite、pro→pro-suite、ai→ai-suite（既有）、data→charts（既有）。
- `DocsComponentsGallery` 支持按套件过滤；base/pro overview 页内嵌本套件画廊。

**R3 Concepts 三组别**
- concepts-suite 页内三节分别讲解：Tuffex Components（定位/安装/五套件划分/链接组件画廊）、Design Foundations（design tokens/字体/颜色体系，链接 foundations）、Utils（公开工具函数，链接 utils）。
- zh/en 段落结构对等。

## 约束

- **文件争用**：DocsSidebar.vue / i18n locales 工作区带有他会话未提交改动（avatar 族折叠任务 08-30-nexus-sidebar-component-families + `families.*` i18n）。content 与画廊先行，侧栏/locale 接线后置；等对方提交或归属明确再动；**绝不把对方 hunks 带进本任务提交**（hunk 级 stage）。
- 不改 `documents 2.0.pen`。
- chart 文档旧 URL 不做跳转（上线仅数小时，无外链存量）。
- 遵循既有 gate：frontmatter 约定、zh/en 段数对等（doc-parity）、mdc-fences、组件 coverage、misc canary 空。

## 验收

- [x] 五个 tab 各自首项为本套件 overview；Data tab 含 Visualization+Charts 全部条目；misc canary 空。
- [x] concepts overview 三节讲解 zh/en 对等，三处链接可达。
- [x] base/pro overview 画廊只列本套件组件。
- [x] nexus typecheck（先 build tuffex）、`pnpm -C apps/nexus test`、check:mdc-fences、check:doc-parity 全绿。
- [x] CDP 明暗截图核查五个 tab 与 concepts 页。
