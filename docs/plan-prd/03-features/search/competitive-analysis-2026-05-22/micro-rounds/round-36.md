# 微审计 36/70

- 审计主题：Alfred File Buffer 是否需要被 Tuff 直接复制成独立 UI/状态机；本轮只核对文件搜索结果、`TuffQuery.inputs` 的 `files` 输入、文件动作入口与主文档中 `ContextActionProvider` / Action Panel evidence 的关系。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
    - 将 Alfred File Filter / Universal Action 映射到 CoreBox FileProvider、Flow files、`acceptedInputTypes` 与 `ContextActionProvider`，没有要求直接复制完整 Workflow 画布或 File Buffer UI。
    - `workflow contract v1` 建议支持 `text/image/files/html/json` 输入，并把 context trigger 限定为 selected text、clipboard image、files 等输入类型必须在 manifest 中显式声明。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
    - 明确记录 Alfred File Buffer 支持多文件动作，但 Tuff 当前“不需要 File Buffer”，而是应补文件 action menu 的键盘证据。
    - Action Panel 对照表把 Tuff 现状写为 MetaOverlay、built-in actions、`item.actions`、file reveal、pin/copy/title、plugin actions，缺口是 action diagnostics / evidence，不是缺一个文件缓冲区本体。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
    - P1 `context-actions-v1` 只要求 selected text、clipboard image、files 三类输入可看到可执行动作列表，并带 inputSource、permission/status/reason。
    - P1 `action-panel-evidence-v1` 要覆盖 app/file/plugin/preview/image item 的 Action Panel，而不是新增 Alfred 式批量文件栈。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 36 条已经给出待复核判断：当前文档没有把 File Buffer 作为独立 P0，而是纳入 files context/action；本轮复核源码后该判断成立。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`
    - `TuffInputType.Files = 'files'`，`TuffQueryInput.content` 对 files 的约定是 JSON 序列化文件路径数组。
    - `TuffQuery.text` 与 `TuffQuery.inputs` 明确区分主动输入和剪贴板/文件/富文本等附加输入。
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
    - `useFileMode && filePaths.length > 0` 时会生成 `TuffInputType.Files`，content 为 `JSON.stringify(filePaths)`。
    - 剪贴板类型为 `files` 时也会生成 `TuffInputType.Files`，并保留安全序列化后的 clipboard metadata。
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
    - FileProvider 是 deferred 文件搜索 provider，承担文件索引、FTS、类型过滤、缩略图/图标、进度和 degraded notice 等能力。
  - `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`
    - `mapFileToTuffItem()` 将文件映射为 `kind: 'file'` 的 `TuffItem`，并提供 `open-file` 与 `open-folder` 两个 item actions。
    - 文件 item 的 `meta.file` 已包含 path、size、created/modified、extension 等基础元数据，可作为文件动作 evidence 的数据底座。
  - `packages/utils/plugin/index.ts`
    - `IPluginFeature.acceptedInputTypes` 可声明 `text/image/files/html`，并说明 query 含 inputs 时只展示接受这些输入类型的 feature。
    - `onFeatureTriggered()` 的 payload 可是 `TuffQuery`，其中包含 images、files、HTML 等附加 inputs；`onItemAction()` 可处理 feature 生成 item 的执行。

- 结论：
  - 主文档当前口径是正确的：Tuff 不需要在 P0 或 P1 直接复制 Alfred File Buffer。Alfred File Buffer 的核心价值是“临时收集多个文件，再对这组文件执行动作”；Tuff 更合适的最小路径，是把文件作为 `TuffQuery.inputs.files` 或 file item meta 进入 Context Actions / Action Panel，而不是先维护一个独立文件缓冲 UI 状态机。
  - Tuff 已有三块真实底座：
    1. 文件召回底座：FileProvider / Everything / native file provider 能产出 file item。
    2. 文件输入底座：file mode 与 clipboard files 能组装成 `TuffInputType.Files`，并以 JSON 路径数组传给插件或动作。
    3. 文件动作底座：`mapFileToTuffItem()` 已有 `open-file`、`open-folder`，`TuffItem.actions` 可承接后续 reveal、copy path、send to workflow 等动作。
  - 仍不能夸大的部分：
    1. 当前还没有 Alfred File Buffer 等价的“多选暂存队列、批量动作、队列可视化、跨查询保留”合同。
    2. 当前文件 item action 只有最小打开/打开文件夹样本，不能宣称覆盖 Raycast/Alfred 的 Quick Look、Open in Terminal、Save as Quicklink、batch workflow 等完整动作族。
    3. `TuffInputType.Files` 只定义输入载体，不等于已经有文件批处理工作流；后续必须通过 `ContextActionProvider` 的 action count、permission/status/reason、失败 toast 和 trace evidence 来证明。
  - 因此，File Buffer 应被视为 Alfred 的高级交互样式，不应成为 Tuff 的直接实现目标。Tuff 的优雅路径是：先让 file item / file inputs 在 MetaOverlay 或 Context Actions 中可发现、可执行、可解释；只有当真实用户流程证明“跨查询多文件暂存”是高频需求时，再考虑受控地引入批量 selection / buffer。

- 是否发现需修正的主文档问题：否。`03`、`05`、`10`、`11` 都没有把 Alfred File Buffer 写成 Tuff 已落地能力，也没有把它列为独立 P0。主文档把它降维到 files context/action 和 Action Panel evidence，符合当前源码事实，也符合 KISS / YAGNI。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-36.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
