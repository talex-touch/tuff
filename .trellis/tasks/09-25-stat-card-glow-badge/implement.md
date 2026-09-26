# Implement — TxStatCard 发光图标徽章

## 前置

- 读 `tuffex-design-rules.md`（Borders / Colour / Motion）、`tuffex-docs-sync.md`（Demos、Gallery specimens、Gates）、research/stat-card.md §2–§7。

## 步骤

1. [x] `TxStatCard.vue` 模板：`__badge > __halo + __badge-body > i.__icon`；删除 `__decoration` / `__icon-layer`。
2. [x] 脚本：共享主题观察器（模块级订阅集合 + 单个 `MutationObserver` + `prefers-color-scheme` 监听，无 `window` 时跳过）；挂载订阅、卸载退订；回调里下一帧 `updateGlowVars()`。
3. [x] 样式：槽位变量、徽章材质（中性 / 着色）、内容预留、容器查询窄态、progress 取色与槽位变量、hover 浮起 + 光晕 + 扫光、reduced-motion 块（保持两条源码正则契约）。删除水印 / 柔光规则与 `--tx-stat-card-icon-opacity(-hover)`。
4. [x] `__tests__/stat-card.test.ts`：`:47–49` 改为断言 `__badge` / `__badge-body` / `__icon`；`:179` 改为 progress 不渲染 `__badge`；新增：切换 `<html>` 的 `class` 后重读取色（fake rAF）；灰色图标为中性（已有用例保留）。
5. [x] 验证（`packages/tuffex` 内）：`node node_modules/vitest/vitest.mjs run packages/components/src/stat-card packages/components/src/__tests__/shadow-light-source.test.ts`；eslint 改动文件；`git diff --check`。
6. [x] 重建 dist（锁 `/tmp/tuffex-build.lock`，`npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`），`pnpm audit:size`；核对 :3200 页面上 stat-card 的 `data-v-*` 与 `dist/es/stat-card/style.css` 一致，不一致按规范协调重启。
7. [x] Nexus：画廊 StatCard 格子（真实感数据、着色）；`DocsComponentsGallery.css:294–298` 注释改写；`StatCardDefaultVariantDemo` 扩成一排色调（primary / success / warning / info 中性）以展示徽章；`stat-card.{zh,en}.mdc` 按 research §3 清单改写（含带日期的视觉契约变更、被否决方案重写、CSS 变量表增删）。
8. [x] Nexus 门禁：`node build/check-demo-registry-orphans.mjs`、`check-mdc-fences.mjs`、`check-doc-translation-parity.mjs`；icon 名称核对（若换了 carbon 图标）。
9. [~] ego 浏览器（TaskSpace 31；已做：画廊暗 / 亮 / hover、文档页色调与 progress、运营状态 demo 窄态、控制台、切主题后成功色徽章 `rgb(74,222,128)` ↔ `rgb(103,194,58)` 随之更新、reduced-motion 下 hover 不浮起不扫光；未做：TemplateDashboard / TemplateShell 截图）：暗 + 亮下画廊格子、stat-card 文档页、`ComponentsOperationsStatusDemo`、`TemplateDashboardDemo`、`TemplateShellDemo`；缩窄容器看窄态；hover 录帧（扫光一次、浮起）；CDP 模拟 `prefers-reduced-motion: reduce`；切换主题后颜色更新；控制台无新增报错。
10. [ ] core-app：`PluginFeatures` / `PluginStorage` 同款传参的渲染抽查（core-app dev 直接读源码；或 SSR 无头截图）。

## 回滚点

组件目录 + `stat-card.{zh,en}.mdc` + demo + 画廊格子各自独立还原；还原后重建 dist。

## 实现与验证记录（2026-09-26）

- 实现 agent：徽章 DOM / 样式、模块级主题观察器（`stat-card/src/theme-change.ts`）、槽位变量、容器查询窄态、progress 跟随取色；测试 12 例；文档中英 + demo（四色调）+ 画廊格子；CSS 较 HEAD +1064 B。
- 检查 agent 修复 5 处：KeepAlive 缓存期间切主题时读到脱离文档的空颜色会清掉着色（改为空值保留上一次结果 + `onActivated` 重读）；观察器补 `data-tx-contrast` 与 `prefers-contrast`；灰色图标的 progress 环取图标自身灰色；删掉 reduced-motion 里的空规则；文档改正（容器查询量的是内容区，窄态实际从卡片宽约 274px 起；高对比亮色下 info 非中性）。测试 15 例（含 shadow-light-source）。
- ego：暗 / 亮 / hover（浮起 + 扫光）画廊格子；文档页四色调（中性灰无光晕）、progress 环、运营状态 demo 窄态三色环（原来全是主色）。`audit:size` 在限额内。
- 未做 / 待定：core-app 插件功能 / 存储页未在运行中的 Electron 里看（另一会话持有 core-app dev）；插件功能页两列在最窄窗口（~260px）会进入窄态，与 design 预期"保持宽态"不同；ProviderRegistry / dashboard overview 两行标签在窄态下数值可能靠近角落徽章（现有数值都很短，未见碰撞，需管理员页面实看）。

## v3 色光记录（2026-09-26 稍后）

- 实现 agent：删徽章，新增 `__aura`（三团色斑，只动 transform）与无框 `__glyph`；测试 18 例（含 Sass 编译后的样式契约）；文档中英、画廊注释。偏离设计一处（未着色时隐藏色斑而非整层，已同步 design.md）。
- 浏览器调校（主会话）：暗色下图标落在同色相色光上几乎看不见、整片色光发灰。改为：
  - 着色卡片的图标墨色向 `--tx-text-color-primary` 偏 40%（亮色更深、暗色更浅）；
  - 读取图标颜色时加 `tx-stat-card--reading` 暂时撤掉这层墨色——否则主题切换重读会"混上加混"（实测两次切换后蓝色色光变成石板灰）；
  - 色斑：主色 66%、邻近色相 56%、同色相提亮（OKLCH l+0.14，保留彩度）60% 移到右上角；无相对颜色时的回落同步。
- ego：画廊格子暗 / 亮；来回切 4 次主题，`--tx-stat-card-icon-color` 稳定在 `rgb(64, 158, 255)`、墨色在两套值间切换、不残留 `--reading`；文档页四色调（主色 / success / warning / 中性无色光）暗亮两套截图。
- 规范：`component-guidelines.md` "Icon boxes, state ink, and colours read back from CSS" 增加第四条（读色前撤掉派生墨色）。
- 再次反馈（2026-09-26，截图 #8，暗色画廊）："太亮了，导致 icon 不显眼"。两团大色斑改为先向页面底色 `--tx-bg-color` 混合（55:45）再取 72% / 62%，第三团改为纯图标色 38% 作为右上角的核心；图标墨色向正文色偏 45%。色光与图标墨色因此总往相反方向走：暗色下色光深、图标浅，亮色下色光浅、图标深。ego 在页面内注入样式对比了三档（A 62:38、B 50:50、C 55:45，四个色调、暗 / 亮），选 C；重建 dist 后暗 / 亮截图确认，来回切 4 次主题取色稳定。
- 第三次反馈（2026-09-26）："还是比较明显，淡一点"。三团色斑透明度约减半（34% / 28% / 18%，回落 24%），遮罩收窄为最右 10% 满、62% 处淡尽。ego 对比了当前 / D（约 60%）/ E（约 45% + 收窄遮罩）四个色调暗亮两套，选 E；重建 dist 后画廊格子暗 / 亮截图确认，图标清楚、色光只是一层底色。
- 第四次反馈（2026-09-26，截图 #9）："icon 感觉有纵向拉伸；背景继续淡 + 模糊 + 些许颗粒感"。
  - 图标：实测 `<i>` 36×36、SVG viewBox 32×32、mask 100% 100%，6 倍放大与 Carbon 源几何一致，并无拉伸；瘦高感来自 `i-carbon-user-activity` 本身（人形身体是 14×12 的窄拱）。画廊格子换成比例舒展的 `i-carbon-user-multiple`（ego 在卡片里并排对比了 6 个候选）。
  - 色光：透明度 24% / 20% / 12%（回落 17%），模糊 22px → 34px；色光层 `::after` 叠 SVG 分形噪声（140px 平铺，overlay 14%），静止、随色光遮罩与淡入。ego 对比了无颗粒 / 7% / overlay 22% / 斑点 / overlay 14% / 平铺 10% 六种，2 倍像素下选 overlay 14%；重建 dist 后暗 / 亮截图确认。
