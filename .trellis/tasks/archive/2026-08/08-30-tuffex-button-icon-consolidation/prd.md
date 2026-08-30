# tuffex button/icon 收拢：Basic 组 7 条目 → button + icon

## 背景

Nexus 文档侧栏 Basic 组当前有 7 个 button/icon 系条目（Button / FlatButton / IconButton / CopyButton / Icon / OS Icon / IconChip）。用户判断（经调研证实）：

- `TuffFlatButton` 与 `TxButton variant="flat"` 完全重复（TxButton 已带 variant-flat + tone 全套样式），生产使用为 0（唯一消费者是 nexus `ui/FlatButton.vue` 包装器，仅 VersionDrawer 用）。
- `TxIconButton` / `TxCopyButton` / `TxOsIcon` 应作为 button / icon 目录的次级导出（`TxSplitButton` 住 `button/`、`TxStatusIcon` 住 `icon/` 是现成先例）。
- `TxIconChip` 语义属 Badge/Tag 族（带文字色块章），不属于 icon —— 只做文档归类调整，组件层不动。
- `TxCopyButton` 并非零使用：tuffex 内部 `stream-markdown/TxCodeBlock.vue`、`code-stream/TxCodeStream.vue` 相对路径引用它，必须保留组件、随目录迁移。

## 需求

- R1 组件层：`button/` 导出 TxButton、TxSplitButton、TxIconButton、TxCopyButton；`icon/` 导出 TuffIcon/TxIcon、TxStatusIcon、TxOsIcon。删除 `flat-button/`、`icon-button/`、`copy-button/`、`os-icon/` 四个目录（含 TuffFlatButton 组件本体、类型与测试；其余三个组件本体与测试迁移保留）。
- R2 兼容契约：除 `TuffFlatButton`（连同 `FlatButtonProps`、`TuffFlatButtonInstance`）外，所有组件名与类型继续从根桶 `@talex-touch/tuffex` 导出，无重命名。深子路径 `./flat-button`、`./icon-button`、`./copy-button`、`./os-icon` 消失（npm 0.3.9 已发布、0.x 语义下可接受的 breaking，须在 CHANGELOG 记录）。
- R3 仓内消费方迁移：nexus（DarkToggle / LanguageToggle / HeaderControls / ui/FlatButton.vue+VersionDrawer / plugins/tuffex.ts / demo-registry+FlatButton demo）、touch-music（IconButton.vue import + main.js 的 icon-button/style.css）、tools/tuffex.{zh,en}.mdc 的子路径示例。
- R4 文档层：icon-button、copy-button 内容并入 button.{zh,en}.mdc；os-icon 并入 icon.{zh,en}.mdc；flat-button 页删除（其能力即 TxButton variant="flat"）；删除 4 组 8 个 mdc 文件；hub index.{zh,en}.mdc 去除死链；TAXONOMY 与 SECTION_ORDER 同步（icon-chip 移到 badge/status-badge 之后）；zh/en 段落数与结构对等。
- R5 门禁：tuffex build + vue-tsc + vitest 绿；nexus typecheck + docs coverage/guard/performance 测试绿；core-app typecheck 绿；touch-music import 有效。

## 非目标

- core-app 本地 `components/base/button/FlatButton.vue`（死代码，另行处理）。
- TxIconButton 的 props 并入 TxButton（toggle/aria-pressed 语义独立，保留组件）。
- icon-chip 组件层任何变更。

## 验收标准

- A1 `rg "tuffex/(flat-button|icon-button|copy-button|os-icon)"` 全仓（除 CHANGELOG）零命中。
- A2 侧栏 Basic 组不再出现 FlatButton/IconButton/CopyButton/OS Icon 条目；IconChip 出现在 badge 族位置。
- A3 覆盖测试的三条不变量（导出目录↔双语文档、hub 链接、demo 引用↔registry↔文件）全绿。
- A4 R5 全部门禁命令通过。

## 风险 / 约束

- 并发会话 talex-touch-bc 正在分批提交存量脏文件，其中 DocsSidebar.vue、docs-page-performance.test.ts、README*.md 与本任务改动面重叠：编辑这些文件前须确认其已被对方提交（git status 转 clean），提交本任务改动时用显式路径一步 stage+commit。
- tuffex vue-tsc 弱于 nexus/core-app 两个下游，两侧 typecheck 都要跑。
- eslint --fix 会把同源值导入并进 import type，禁止整文件 --fix。
