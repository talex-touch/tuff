---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Nexus 融合根目录 examples 常用代码板块
complexity: medium
planning_method: builtin
created_at: 2026-01-21T13:22:17+0800
---

# Plan: Nexus 融合根目录 examples 常用代码板块

🎯 任务概述
把仓库根目录 `examples/` 作为“常用代码”的统一入口，并在 Nexus 开发者文档中建立对应板块（示例/代码片段），形成可维护的展示与引用路径，避免重复维护。

📋 执行计划
1. 明确范围与验收：确认“Nexus 融合”的落点是 `apps/nexus` 开发者文档还是另有入口；定义“常用代码”清单与优先级（例如插件 SDK、CoreBox、Storage、Channel、DivisionBox 等）。
2. 盘点与归类现有示例：整理 `examples/` 与 `apps/nexus/content/docs/dev/reference/snippets.*.md` 的内容，标注重复/缺失/需要更新的示例，输出目录分层建议。
3. 设计示例结构：确定 `examples/` 内的分组与命名规范（如 `examples/snippets/`、`examples/division-box/` 等），补齐 `README.md`/索引文件以形成可浏览入口。
4. 设计 Nexus 集成方式：选定“单一事实来源”方案（优先以 `examples/` 为源），确定同步方式：
   - 方案 A：在 `apps/nexus/content/docs/dev/reference/examples.*.md` 中手工引用示例（复制代码块）。
   - 方案 B：新增脚本从 `examples/` 生成/同步到 Nexus 文档（推荐，减少双维护）。
   （最终择一落地，并在计划内定义脚本与触发方式）
5. 更新 Nexus 文档导航：在 `apps/nexus/content/docs/dev/index.*.md` 与 `apps/nexus/content/docs/dev/reference/index.*.md` 增加“示例/代码片段”入口，补充跨文档链接与说明。
6. 验证与维护约定：运行 Nexus 文档预览/构建（必要时 `content:reset`），确认示例渲染与链接有效；补充“新增示例流程”和同步规则，避免后续漂移。

## 范围与优先级清单（NEXEX-010）

### 落点决策
- Nexus 融合入口：`apps/nexus/content/docs/dev/reference/` 下新增 `examples.*.md` 作为“示例/常用代码”主入口（导航入口在后续任务补齐）。
- 示例源目录：仓库根目录 `examples/`（含子目录）。
- 受控范围：仅覆盖 `examples/` 与 Nexus 文档入口的映射/引用；不扩展到 `apps/core-app` 或 `packages/**` 的非示例文件。
- 现有 `apps/nexus/content/docs/dev/reference/snippets.*.md` 视为历史入口，后续按任务统一归并至 `examples.*.md`。

### 优先级依据
- 以“新手入门必需性 + 高频使用 + 依赖链路基础性”为排序依据；先基础 SDK，再通信与 UI 能力，最后通用工具。

### 常用代码类别与优先级
| 优先级 | 类别 | 覆盖范围（示例/目录） | 说明 |
| --- | --- | --- | --- |
| 1 | 插件基础与生命周期 | `examples/basic-usage.js`、`examples/index.js`、`examples/complete-example.js`、`examples/plugin-index-example.js`、`examples/plugin-receiver-example.js` | 插件入门与生命周期的必备示例 |
| 2 | 插件通信/Channel | `examples/communicate-example.js`、`examples/complete-communication-example.js` | 插件与宿主/插件间的核心通信场景 |
| 3 | 消息与通知 | `examples/message-system-example.js`、`examples/notification-example.js` | 用户反馈与事件提示的常用范式 |
| 4 | DivisionBox 交互 | `examples/division-box/` | 常见 UI/Flow 交互与工作流场景 |
| 5 | 工具包与通用能力 | `examples/util-pkg/` | 复用性高的工具能力与基础包 |

⚠️ 风险与注意事项
- Nuxt Content 生产构建可能无法直接读取 `examples/` 代码文件，需确认可行的同步/复制策略。
- 示例跨中英文文档时会产生重复维护成本，需明确是否必须双语。
- 现有示例可能与最新 SDK/API 有出入，需核对并避免引入过时示例。

📎 参考
- `examples/index.js`
- `examples/division-box/README.md`
- `apps/nexus/content/docs/dev/reference/snippets.zh.md`
- `apps/nexus/content/docs/dev/reference/index.zh.md`
- `apps/nexus/content/docs/dev/index.zh.md`
- `apps/nexus/nuxt.config.ts`
