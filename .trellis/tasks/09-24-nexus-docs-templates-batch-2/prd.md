# Nexus 模板第二批：5 个新风格 + 5 个新章节

## Goal

第一批 10 个模板（任务 `09-23-nexus-docs-templates-tab`）已验收。老板要求「继续细化多一点 template」。第二批在两个方向上扩展：已有章节加第二种风格，展示同一场景的另一种做法；另开新章节，扩大场景覆盖。

## Decisions (from the user, 2026-09-24)

- D1 扩展方向：混合——5 个已有章节各加 1 种新风格 + 5 个新章节，共 10 个新模板。
- D2 管理方式：新建本任务，第一批任务保持独立、可单独验收 / 提交。
- D3 清单（老板在选项预览中看过并选定）：

  | 类型 | 章节 | 新模板 | 分组 |
  |---|---|---|---|
  | 新风格 | CMS 内容管理 | 看板排期（草稿 → 审核 → 排期 → 发布，可拖拽） | 内容运营 |
  | 新风格 | AgentChat 智能体对话 | 侧边 Copilot（页面内嵌助手） | AI 应用 |
  | 新风格 | Dashboard 数据看板 | 运营大屏（大字 KPI + 地图 / 桑基） | 数据与流程 |
  | 新风格 | Inbox 收件箱 | 通知中心（按类型分组 + 批量已读） | 内容运营 |
  | 新风格 | Shell 应用外壳 | 顶栏控制台（水平导航 + 工作区） | 应用框架 |
  | 新章节 | Onboarding 登录引导 | — | 应用框架 |
  | 新章节 | Files 文件管理 | — | 内容运营 |
  | 新章节 | Store 插件商店 | — | 内容运营 |
  | 新章节 | Release 发布控制台 | — | 数据与流程 |
  | 新章节 | Docs 知识库阅读器 | — | 内容运营 |
- D4 行内代码修复选方案 A（2026-09-24 规划审阅时拍板，同时批准开工）：docs 页脚本与 `highlight.client.ts` 排除 `.not-prose` 子树，是「不改 docs 页」的唯一例外，见 design §3a。

## Background

- 第一批的全部契约沿用：`.trellis/spec/frontend/nexus-docs-templates.md`（接入链路、`TemplateFrame` 签名与行为矩阵、模板规则、验证命令），以及 `tuffex-docs-sync.md` 的 Demos / Gates 两节。
- 第一批的组件调研可复用：`.trellis/tasks/09-23-nexus-docs-templates-tab/research/{app-shells,content,ai,data-flow}.md`；已知 tuffex 缺陷与绕法见该任务 `design.md` §6.11。
- 章节页结构：`## 场景 / ## 模板（每种风格一个 ###）/ ## 组成 / ## 交互要点 / ## 改造建议`。第一批每章只有一个 `###`，本批为 5 个章节追加第二个。
- 并行会话仍在同一工作树改 Nexus（侧栏、画廊、tuffex 组件）；共享文件只做插入式改动，改前先重读。

## Constraints

- 插件商店不出现价格、付费、Pro 角标、购买与结算入口：Nexus AGENTS.md 禁止 mock checkout、伪成功购买入口和固定假价格，商店只展示免费插件的安装 / 更新 / 卸载。
- 发布控制台里的版本号（`v2.5.0-demo.N`）、sha256、签名等一律是明显的示例数据并标注「示例」，不给下载链接，不暗示真实发布链路（R1 Release Integrity 只认真实证据）。
- 不改 tuffex 源码 / dist，不改 docs 布局、`TuffDemoWrapper.vue`、`DocsComponentsGallery.*`；唯一例外是 D4。

## Requirements

- R1 5 个新风格：对应章节页的 `## 模板` 下新增一个 `### <风格名>` 和它的 demo，`## 组成` / `## 交互要点` 补上该风格独有的内容；中英同构。
- R2 5 个新章节：沿用第一批的完整接入链路（页面、TAXONOMY、SECTION_ORDER、demo、registry），并按分组插入侧栏。
- R3 全部 10 个新模板满足第一批的模板规则：三档容器宽度、展开态、暗 / 亮主题、减弱动效、双语、不劫持滚动与焦点、`TxToastPanel` 反馈、不外链图片。
- R4 第一批 10 个模板不回退。
- R5 共享修复（design §3a）：展开 / 收起不再清零模板内滚动位置；模板内的行内代码不再被文档页截走（不写读者剪贴板、不弹站点提示），模板内代码块不被文档页增强脚本改写。
- R6 安全闸门：安装、更新、权限确认、系统授权、放量、晋级一律由读者点击触发，演示脚本最多停在确认处；自动演示不写读者的真实剪贴板、不改浏览器选区（读者主动点「复制」除外）。

## Acceptance Criteria

- [x] 侧栏「模板」下出现 5 个新章节，分组与顺序正确，各 suite 无「其他」组。
- [x] 5 个已有章节页各有两个风格 demo，中英页面章节数一致。
- [x] 10 个新模板在 ego 中完成列内暗 / 亮、展开、窄屏、核心交互、减弱动效检查，无溢出、无控制台报错。
- [x] 门禁（4 个 `check-*`、图标名、分类脚本 dry-run、3 组 vitest、eslint、vue-tsc、`git diff --check`）全部通过。
- [x] 回归：第一批 Inbox 列表滚到中段后展开再收起，滚动位置保持；点 Research 正文的行内代码不复制、不弹站点提示；CMS 与 Docs 模板的代码块里没有 `.docs-code-header`、没有 highlight.js 标记。
- [x] Copilot 划词工具条在页面滚动、侧栏折叠、展开 / 收起后仍贴着选区。

## Out of Scope

- 修改第一批模板的既有风格（除非新风格需要抽取共享的 mock 数据）；修复 tuffex 组件缺陷；价格与订阅相关界面。

## Verification record (2026-09-25)

- 浏览器（ego 空间 14）：10 个新模板逐一完成列内暗 / 亮、展开、560 窄屏、核心交互、减弱动效，0 溢出、0 控制台错误（仅 Lexi 扩展的 hydration 噪音）；三轮修复（阶段 C 问题、trellis-check 报告的 a11y / 交互项）全部复验通过。第一批 5 个章节页的第一种风格回归通过。
- 回归 AC：Inbox 滚动 1086 → 展开 1086 → 收起 1086；模板内行内代码不再被增强或截获；Docs 模板 2 个 `pre` / 18 个 `code` 无 `.docs-code-header`、无 hljs（CMS 首屏无 `pre`）。
- Copilot 浮条：页面滚动、文章内滚动、侧栏收起 / 展开、舞台展开 / 收起后间距保持 8–10px。
- 门禁：4 个 `check-*` 通过；dry-run 0；图标 916 处 0 错；vitest 28/28；eslint 0；vue-tsc 仅 12 个既有错误；侧栏 API 两种语言各 15 个模板无 null；空白检查干净。

