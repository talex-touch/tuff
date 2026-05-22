# 微审计 06/70

## 审计主题

本轮只审一个具体映射点：Raycast / Alfred / uTools 的“截图或剪贴板图片 -> OCR / 图片翻译 -> 可见结果 / 失败态”能力，在 Tuff 当前实现里是否已经有真实链路，以及主文档把缺口定位为 Translation/OCR/AI Command Contract v1 与 evidence 是否准确。

选择该主题的原因是：已有 micro-round 01-03 已覆盖 Context Actions、参数变量与 `TuffQuery.inputs` 输入过滤，本轮不重复审通用输入模型，而是落到 `touch-translation` 与 CoreBox 图片翻译的具体执行链路。

## 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
   - 主文档判断：翻译、OCR、AI 命令是“输入来源 -> 参数化命令 -> provider 执行 -> 可见结果 -> 可恢复失败”的同一条链路。
   - 主文档明确认为 Tuff 不是零基础：`touch-translation`、OCR service、CoreBox image translate、`touch-intelligence`、OmniPanel Writing Tools 都已有散点能力。
   - 主文档也明确保留缺口：缺统一 input source、provider evidence、packaged 剪贴板图片 / 截图权限 / fallback 样本。

2. `plugins/touch-translation/manifest.json`
   - `touch-translate` 和 `multi-source-translate` 声明 `acceptedInputTypes: ["text"]`。
   - `screenshot-translate` 声明 `acceptedInputTypes: ["text", "image"]`，关键词包含 `screenshot` / `截图` / `ocr` / `识别`，命令包含 `s-fy` / `截图翻译`。
   - 权限声明包含 `clipboard.read`、`network.internet`、`intelligence.basic`、`storage.plugin`、`window.create`，与翻译 / OCR / 图片结果窗口的最小能力相符。

3. `plugins/touch-translation/index/main.ts`
   - `extractImageDataUrl()` 会从 `query.inputs` 中提取 `type === "image"` 且内容为 `data:image/` 的输入。
   - `resolveTextToTranslate()` 在 `screenshot-translate` 没有文本时，会读取图片输入并调用 Intelligence `vision.ocr`，OCR 为空时返回 `NO_INPUT_OCR_MESSAGE`，权限不足时返回 `PERMISSION_DENIED_MESSAGE`。
   - `translateImageFromClipboardInput()` 会对图片输入调用 `image.translate.e2e`，并把 `provider`、`model`、`traceId` 写入图片翻译结果 payload。
   - 图片翻译结果优先通过 `plugin.divisionBox.open()` 展示，失败时回落到 CoreBox item；这说明“可见结果”链路存在，不只是后台能力。

4. `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
   - `translateCoreBoxImageItem()` 支持从 image item 的 raw content 读取 data URL 或本地文件路径。
   - `translateClipboardImage()` 直接读取 Electron clipboard image；剪贴板为空时返回 `IMAGE_UNAVAILABLE`。
   - `translateImageBase64()` 调用 Nexus scene `COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID`，并传入 capability `image.translate.e2e`；scene 不可用时返回 `SCENE_UNAVAILABLE`。
   - 成功后可打开 pin window 或写回剪贴板，说明 CoreBox 侧也有真实图片翻译出口。

## 结论

主文档对这个映射点的判断成立：Tuff 当前已经有“图片输入 -> OCR / image translate -> 结果展示”的真实代码路径，不是只在竞品分析里规划。`touch-translation` 的 `screenshot-translate` 能接受图片输入，插件入口能从 `TuffQuery.inputs` 提取 data URL，既能走 `vision.ocr` 作为文本 fallback，也能走 `image.translate.e2e` 生成图片翻译结果；CoreBox 侧还单独支持 image item / clipboard image 到 Nexus scene 的图片翻译。

但它还不能被写成完整对齐 Raycast / Alfred / uTools 的用户体验闭环。当前源码证据显示的是“能力链路存在”，不是“packaged 体验已闭环”：

1. `touch-translation` 能把 `provider` / `model` / `traceId` 放入图片翻译 payload，但普通文本翻译、OCR fallback、CoreBox scene failure 还没有统一的 `ProviderEvidence` 合同。
2. CoreBox `image-translate.ts` 已有 `IMAGE_UNAVAILABLE`、`SCENE_UNAVAILABLE` 等失败 code，但这些 code 是否在所有入口转成用户可恢复动作，还需要 packaged / UI evidence。
3. `screenshot-translate` 名称和命令已经存在，但从源码看，本轮只确认了 image data URL 输入链路；真实截图权限、空截图、Wayland / macOS permission denied 等平台态仍需要单独样本。
4. 图片输入里包含 data URL / base64，主文档要求 hash、mime、size、临时 ref、redaction 的方向是必要的；当前实现还不能替代隐私 evidence。

因此主文档提出的 `InputSourceEnvelope`、`AiCommandTemplate`、`ProviderEvidence`、`PrivacyRedactionPolicy` 是正确的最小下一步。KISS/YAGNI 角度看，不需要先做完整工作流编辑器或复制 uTools 鼠标超级面板；更合适的是先把现有 `screenshot-translate`、CoreBox image translate、OmniPanel selected text 三条路径统一记录 input source / provider / failure / redaction。

## 是否发现需修正的主文档问题

否。

本轮没有发现需要修改 `01-11` 主分析文档的问题。主文档没有把源码存在夸大成完整体验，已明确标注 packaged Electron 剪贴板图片、截图权限、fallback、provider health、secret health、privacy evidence 仍需补齐。当前代码核对结果支持该边界。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-06.md` 作为 micro round 输出。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 `git commit` / `git push` / 分支 / reset / checkout / 清理工作树操作。
