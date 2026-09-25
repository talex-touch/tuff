# Implement — Nexus 模板第二批

顺序：A（骨架与接入，主会话）→ B（10 个模板，4 个 trellis-implement agent 按组并行）→ C（ego 浏览器验收，主会话单一 TaskSpace）→ D（门禁、检查 agent、规范）。

## 阶段 A — 骨架与接入（主会话）

- [x] A0 动共享文件前重读：`DocsSidebar.vue`、`demo-registry.ts`、`scripts/recategorize-component-docs.py`，以及 5 个要追加风格的章节页（并行会话可能刚改过）。
- [x] A1 5 个新章节：骨架 demo（`TemplateFrame` + 占位）、中英骨架页（五节结构）、TAXONOMY、SECTION_ORDER、registry 行——同批落地。
- [x] A2 5 个新风格：骨架 demo + registry 行；对应章节页（中英）在第一种风格之后追加 `### <风格名>` 骨架段与 `TuffDemoWrapper`。
- [x] A3 共享修复（design §3a）：`TemplateFrame` 展开 / 收起前快照、之后写回模板内滚动位置；行内代码按方案 A（PRD D4）：`[...slug].vue` 的 `getInlineCodeElement` / `enhanceInlineCode` / `enhanceCodeBlocks` 与 `highlight.client.ts` 排除 `.not-prose` 子树。在 ego 里用第一批的 Inbox（列表滚到中段 → 展开 → 收起）与 Research（点正文里的行内代码）回归。
- [x] A4 检查点（2026-09-24：门禁全过、dry-run 0、侧栏 API 两种语言 15 个模板无 null、10 页 200、vue-tsc 仅 12 个既有错误；ego 空间 14：侧栏顺序正确、双舞台互不干扰、Inbox 滚动 1086 → 展开 1086 → 收起 1086、模板内行内代码不再被增强或截获；CMS 首屏无 `pre`，代码块检查移到阶段 C 的 Docs 模板）：4 个 `check-*` 门禁、分类脚本 dry-run（`would update 0 file(s)`）、侧栏 API 无 `category: null`（先清 `.nuxt/cache/nitro/functions/docs-sidebar-components/`）、ego 抽查侧栏新条目与一个双风格页面上两个舞台互不干扰。

## 阶段 B — 模板实现（4 个 agent 并行）

| agent | 模板 | 调研上下文 |
|---|---|---|
| impl-b2-app | Shell 顶栏控制台、Onboarding | research/app.md + 第一批 research/app-shells.md |
| impl-b2-content-a | CMS 看板排期、Inbox 通知中心、Files | research/content-a.md + 第一批 research/content.md |
| impl-b2-content-b | Store、Docs | research/content-b.md + 第一批 research/content.md |
| impl-b2-ai-data | AgentChat 侧边 Copilot、Dashboard 运营大屏、Release | research/ai-data.md + 第一批 research/{ai,data-flow}.md |

进展（2026-09-25）：4 个 agent 全部交付，自检全过；impl-b2-content-a 中途撞 API 限流（429）后续跑完成。

每个 agent 只改自己名下的 demo 文件与对应页面（新章节的整页；已有章节页只改新风格相关的段落与追加行，第一种风格原样保留）。自检同第一批：eslint、vue-tsc（`.nuxt/tsconfig.app.json`，只看自己的文件）、dev server 编译 200、4 个门禁、图标名校验、分类脚本 dry-run。不重启 dev server、不跑 nuxt/pnpm typecheck、不用浏览器、不 commit。

## 阶段 C — 浏览器验收（主会话，一个 ego TaskSpace）

结果（ego 空间 14；`:3200` 中途因内存溢出宕掉，期间改用 `[::1]:3000`，恢复后切回）：10 个新模板全部完成列内暗 / 亮、展开、560 窄屏、核心交互、减弱动效检查，0 溢出、0 控制台报错（仅 Lexi 扩展的 hydration 噪音）。发回修复并复验通过的问题：
- Copilot：展开 / 收起时 Teleport 移动 DOM，live Range 塌缩，浮条钉在旧视口位置 → 记录边界节点并在测量前复位。
- Release：列内闸门页脚挤成两行；开始前滑块停在 25%（应为 5%）；宽屏产物表被挤窄 → 按表格宽度选列。
- 运营大屏：窄屏面板被压进 600px 互相重叠 → 内部滚动。地图无大陆 → 根因是 `public/geo/world-countries.geo.json` 里百慕大外环逆时针，d3-geo 填满整个球面（组件文档 maps 页同样受影响），主会话反转该环修复（1 行）。
- Shell 顶栏控制台：状态徽标折行；⌘K 关闭后焦点落到 body（第二次 Esc 收不起全屏）；产品名截断；减弱动效下提示出现「「」」空名。
- Onboarding：邮箱输入框过窄；预览说明缺标签。
- Store：亮色下轮播按钮对比度不足；更新提示停留过久。Docs：展开 / 收起后锁定标题错位。
- Inbox 通知中心：到达提示盖住分类页签；CMS 看板：列内排期时间被截断。
第一批 5 个章节页的第一种风格回归通过。收尾中：Files 文件名断行与根节点图标、Release 紧凑表 sha256 折行两个小瑕疵。


每个新模板：列内暗 / 亮、展开、窄屏（560 视口）、核心交互、减弱动效（在舞台完整入视口后再判断——`@enter` 需要 ≥35% 可见）、控制台无新增报错；同页双风格互不干扰；第一批 10 个模板抽查不回退。

## 阶段 D — 门禁与收尾

- [x] 4 个 `check-*`、图标名校验、分类脚本 dry-run、3 组 vitest、eslint、vue-tsc、`git diff --check`（2026-09-25：门禁全过；dry-run 0；图标 916 处 0 错；vitest 28/28；eslint 0；vue-tsc 仅 12 个既有错误；侧栏 API 两种语言各 15 个模板无 null；已跟踪文件 diff --check 干净，未跟踪文件逐个扫描无行尾空白 / CRLF）
- [x] trellis-check agent 按设计规范审全部新文件（check-b2：自修 6 处不影响显示的问题；报告 7 项 → 提示悬停保持 / 关闭时 inert、菜单关闭归还焦点、Inbox 设置弹层焦点、Onboarding 预览改用 data-theme、Files 复选框可访问名交回各组修复并浏览器复验；额外断点规则改为写进规范）
- [x] 规范：`nexus-docs-templates.md` 补「一页多风格」约定与本批新坑（§3 第二风格写法；§5 舞台内滚动恢复、Range 塌缩、重排后锚点对齐；§6 代码隔离、强制暗色作用域、TxCommandPalette 焦点归还、提示自动关闭；§8 IPv6 回环、TS1128 陷阱、按有效不透明度判断可见）；`tuffex-docs-sync.md` → Demos 补 docs 页代码脚本跳过 `.not-prose` 与世界 GeoJSON 环绕方向
- [ ] 不 commit，除非老板要求
