# 微审计 44/70

## 审计主题

uTools 多数据源触发里的图片、文件、截图匹配，映射到 Tuff 当前 `TuffInputType`、`acceptedInputTypes`、剪贴板输入构造、`touch-translation` 图片翻译与 CoreBox 图片 Action Panel 时，是否能被视为完整覆盖，还是只能算已有 text/image/files/html 输入底座加部分图片翻译闭环。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节把 uTools 优势归纳为“入口 + 数据源匹配 + 插件市场”，并明确 Tuff 不应复制桌面鼠标超级面板，而应先做 selected text、clipboard image、files 的 `ContextActionProvider` 小闭环。
  - 第 4 节把“图片匹配 OCR / 翻译”映射到 `touch-translation` 与 Assistant 剪贴板图片翻译；第 6.1 节把 `screenshot-region` 放到后置输入来源，说明截图不是 v1 已完成输入源。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
  - 第 3 节确认 `touch-translation` 的 `screenshot-translate` 支持 `acceptedInputTypes: ["text", "image"]`，但仍缺真实剪贴板图片、截图权限和 fallback 样本。
  - 第 4 节把 `clipboard image`、`screenshot`、`file image` 分开建模，要求截图权限拒绝和 packaged evidence 不能省略。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 44 条已有同向结论：Tuff 类型支持 text/image/files/html，Translation 支持 text/image；截图仍需 evidence，不应宣称 complete。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 明确定义 `text`、`image`、`files`、`html`；`TuffQueryInput.content` 对 image 使用 data URL，对 files 使用 JSON 序列化路径数组。
  - `TuffQuery` 注释区分用户主动输入的 `text` 与来自剪贴板等来源的 `inputs`，这是多数据源触发能否审计清楚的关键。
- `packages/utils/plugin/index.ts`
  - `IPluginFeature.acceptedInputTypes?: Array<'text' | 'image' | 'files' | 'html'>`，并说明 query 含 inputs 时只展示接受对应输入类型的 feature。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
  - `buildClipboardQueryInputs()` 按 image、file mode、clipboard files、text/html 顺序构建 `TuffQueryInput[]`；图片输入使用 `TuffInputType.Image`，文件输入使用 `TuffInputType.Files`。
- `plugins/touch-translation/manifest.json`
  - `touch-translate` 与 `multi-source-translate` 只接受 text；`screenshot-translate` 标记为 experimental，并声明 `acceptedInputTypes: ["text", "image"]`。
- `plugins/touch-translation/index/main.ts`
  - `extractImageDataUrl()` 只从 `query.inputs` 中寻找 `type === 'image'` 且 `content` 为 `data:image/` 的输入。
  - `translateImageFromClipboardInput()` 调用 `image.translate.e2e`，成功 payload 带 `provider`、`model`、`traceId`，失败时展示归一化错误。
- `apps/core-app/src/renderer/src/components/render/ActionPanel.vue` 与 `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
  - image item 已有“翻译图片 / 翻译并置顶”动作，并通过 `coreBoxImageTranslateEvent` 发送到主进程图片翻译链路。

## 结论

主文档的边界判断成立：Tuff 已有能承接 uTools 多数据源触发的底层输入合同，但当前还不能宣称“图片 / 文件 / 截图”完整覆盖。

已经成立的部分：

1. `TuffInputType` 与 `TuffQuery.inputs` 已覆盖 text、image、files、html，且区分 typed query 与附加输入，具备可审计输入来源的基础。
2. 插件 feature 可声明 `acceptedInputTypes`，CoreBox 激活插件 feature 时会依据输入能力展示输入态，方向上可映射 uTools `cmds` 数据源匹配。
3. 剪贴板图片和文件路径已经能被构造成 `TuffQueryInput`；`touch-translation` 的实验截图翻译 feature 能消费 image data URL，并接入 `image.translate.e2e`。
4. CoreBox 图片结果已有 Action Panel 动作，可把 image item 送入图片翻译，说明“图片 item -> 上下文动作”不是纯文档设想。

仍需保持未完成口径的部分：

1. `screenshot-translate` 命名上是截图翻译，但源码消费的是 `query.inputs` 里的 image data URL；直接的截图区域输入、屏幕录制权限、Wayland/macOS TCC 拒绝态仍需要 evidence。
2. 文件输入已有 `files` 合同，但本轮未看到和 uTools 文件/文件夹超级面板等价的统一动作 provider；当前只能支撑 files context/action 的后续设计，不能说完整对齐。
3. 图片翻译路径有 provider/model/traceId，但主文档要求的 packaged Electron 剪贴板图片、截图权限拒绝、scene unavailable、OCR empty、文件过大等验收样本仍是必要缺口。
4. `ContextActionProvider` 仍是待落合同；现有 Action Panel 是可复用入口，不等于 Alfred Universal Actions 或 uTools 超级面板完整能力。

因此，第 44 轮的准确结论是：Tuff 对 uTools 多数据源触发已有真实底座，尤其是 clipboard image 与 image item 翻译链路；但截图和文件上下文动作仍必须以 `experimental` / evidence-missing / contract-pending 的方式表述。后续优先级应是补 `clipboard-image-ocr-translate-v1` 与 `files context action` 的固定样本，而不是扩大宣称范围或复制 uTools 鼠标超级面板。

## 是否发现需修正的主文档问题

否。

`04-utools-plugin-cross-platform.md`、`07-translation-ocr-ai-commands.md` 与 `11-100-round-cross-review-ledger.md` 没有把当前源码夸大成完整多数据源超级面板能力。它们明确把 v1 收敛到 selected text、clipboard image、files，并把 screenshot-region、截图权限、packaged evidence、provider failure reason 放到后续验收中；这与源码核对结果一致。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增本微审计输出文件：`docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-44.md`。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / 创建分支 / reset / checkout。
