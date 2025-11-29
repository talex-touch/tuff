# Tuff 文档体系重构 PRD

## 背景 & 痛点
- 现有 `apps/docs` 内容散落在 `documents/`、`plugins/`、`plugin-extensions/` 等多目录中，中英混排且命名不统一，用户找不到入口。
- 文档受众（普通用户 vs. 资深用户 vs. 开发者）被放在同一个维度，导致学习路径断裂，FAQ、技巧、API 资料互相挤占空间。
- 命名混乱（`hello.md`、`start.md` 等），没有 `.zh.md` 后缀，内容更新无法区分中文版本。

## 重构目标
1. 输出三大板块：**应用使用介绍**、**应用使用技巧**、**应用开发文档**，对应三类典型用户的学习路径。
2. 所有中文内容统一 `*.zh.md` 命名，标题、示例、代码注释全部中文化，必要时保留原英文术语。
3. 重写导航与目录结构，让每个章节只讲一件事，目录层级 ≤ 3。
4. 保留现有信息资产（插件配置、API、FAQ 等），在新结构里复用或补完；落地时同步更新 docs 入口页。

## 目标人群 & 核心场景
| 角色 | 诉求 | 对应板块 |
| --- | --- | --- |
| 新用户 | 快速了解产品价值、安装并体验关键功能 | 应用使用介绍 |
| 深度用户 | 按场景（智能工作流、自动化、快捷键等）快速找到技巧 | 应用使用技巧 |
| 开发者/插件作者 | 明确插件结构、API、打包与上架流程 | 应用开发文档 |

## 顶层信息架构
```
docs/
├── guide/                      # 应用使用介绍
│   ├── index.zh.md             # 核心价值 & 信息总览
│   ├── start.zh.md             # 安装、环境要求、账号
│   ├── features/
│   │   ├── plugin-ecosystem.zh.md
│   │   ├── workspace.zh.md     # 多实例、同步、个性化
│   │   └── marketplace.zh.md
│   └── scenes/
│       ├── student.zh.md
│       ├── developer.zh.md
│       └── creator.zh.md
├── tips/                       # 应用使用技巧
│   ├── index.zh.md             # 使用原则 & 入口
│   ├── intelligence-workflow.zh.md
│   ├── automation.zh.md        # 快捷指令、CoreBox 闭环
│   ├── productivity.zh.md      # 同步、模板、面板
│   └── faq.zh.md               # 常见问题集中化
└── dev/                        # 应用开发文档
    ├── overview.zh.md          # 插件模型 & 生命周期
    ├── quickstart.zh.md        # init/index.js 模板
    ├── manifest.zh.md          # manifest.json 字段表
    ├── api/
    │   ├── channel.zh.md
    │   ├── storage.zh.md
    │   ├── event.zh.md
    │   └── widget.zh.md
    ├── extensions/
    │   ├── search-sorting.zh.md
    │   └── toast.zh.md
    ├── publish.zh.md           # 打包、签名、市场上架
    └── snippets.zh.md          # index.js、preload、utils 片段
```

## 内容迁移映射
- `documents/index.md` → `guide/index.zh.md`，重写为中文产品概览。
- `documents/start.md` → `guide/start.zh.md`，按平台/版本拆分，小节化安装、账号、同步。
- `documents/plugin_market.md`、`documents/customization.md` → `guide/features/marketplace.zh.md`、`guide/features/workspace.zh.md`。
- `documents/account.md`、`documents/sync.md` → 合并入 `guide/start.zh.md` 与 `guide/features/workspace.zh.md`。
- `q-a/index.md` → `tips/faq.zh.md`，重写问答。
- `plugin-extensions/*` → `dev/extensions/` 下对应文件。
- `plugins/` 目录的 API / 配置文档 → `dev/` 结构（manifest、init、storage、event、widget、publish、utils、snippets 等），统一语言风格。
- `about/`（team、changelog）暂保留在 `guide/extra/` 或单独入口，按中文命名，开发阶段不动内容只换路径。

## 章节内容要点
### 1. 应用使用介绍（guide）
- 每节“只讲一件事”，图示/步骤化描述（文案 + 表格即可）。
- 统一包含「适用对象」「场景实例」「关键操作」三段。
- 在 `guide/index.zh.md` 输出产品定位、核心功能矩阵、桌面端差异。

### 2. 应用使用技巧（tips）
- `intelligence-workflow.zh.md`：描述智能工作流的搭建、触发、调试、模板示例。
- `automation.zh.md`：CoreBox 搜索、快捷键、剪贴板联动，附命令清单。
- `productivity.zh.md`：同步、模板、工作面板以及和第三方工具联动。
- `faq.zh.md`：从安装、权限、性能、账号四大类汇总，提供操作链接。

### 3. 应用开发文档（dev）
- `overview.zh.md`：模块生命周期图、目录结构、插件运行沙箱说明。
- `quickstart.zh.md`：`init/index.js`、`manifest.json` 最小示例 + CLI 流程。
- `manifest.zh.md`：字段表（类型/是否必填/默认值/示例）、常见错误提示。
- `api/`：按模块拆分（Channel/Storage/Event/Widget），每节“概念 → API 表 → 示例 → 注意事项”。
- `publish.zh.md`：dev/build/publish 全流程，补充 `pnpm` 命令、调试日志定位。
- `snippets.zh.md`：常见代码片段集中，引用注解维持老王风格。

## 交付 & 里程碑
1. **第 1 阶段**（当前）：完成 PRD、目录规划、命名规范，并给出迁移映射（本文件）。
2. **第 2 阶段**：批量重命名文件、创建新目录、迁移/翻译内容、补齐缺失章节。
3. **第 3 阶段**：联动 Electron/Vite Docs 入口与 `apps/docs/vite.config.ts` 菜单，新增导航/侧边栏。

## 验收标准
- `apps/docs` 下全部中文文档命名满足 `*.zh.md`。
- Docs 首页引用新的三段式目录。
- 任何一个主题只在一个章节描述，不再重复。
- API 文档示例可直接复制运行；manifest、index.js 等章节配有验证步骤。

## 后续注意事项
- 重写时统一术语（如「CoreBox」「智能工作流」「插件市场」）。
- 插件示例代码需对齐仓库 `packages/utils` 的最新接口，避免老旧 API。
- 迁移完成后要更新主 README（中/英）里的文档入口，防止 404。
