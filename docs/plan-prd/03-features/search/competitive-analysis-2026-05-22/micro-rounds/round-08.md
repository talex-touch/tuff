# 微审计 08/70

## 审计主题

Raycast / Alfred / uTools 的图片 OCR、截图翻译与剪贴板图片动作，是否能映射到 Tuff 当前 `touch-translation`、CoreBox image translate 与 OCR service 的真实能力边界。

本轮只审一个具体映射点：当输入是剪贴板图片、截图图片或文件图片时，Tuff 是否已有“可执行路径 + 错误码 / provider 证据 + 隐私边界”的基础；以及主分析文档把缺口定位为 packaged evidence、input source 与 provider / scene failure 展示，而不是“完全没有图片翻译能力”，是否准确。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
  - 第 1 节说明翻译 / OCR / AI 命令应被看作“输入来源 -> 参数化命令 -> provider 执行 -> 可见结果 -> 可恢复失败”的链路。
  - 第 3 节确认 `touch-translation` 已有截图 / 图片翻译入口，OCR service 有后台 job/result 与隐私截断能力，但仍缺 packaged Electron 剪贴板图片、截图权限、fallback 样本。
  - 第 5 节把剪贴板图片翻译缺口明确为 `empty-image`、size limit、provider health、pin window evidence，而不是补一个全新 OCR 子系统。
- `plugins/touch-translation/manifest.json`
  - `screenshot-translate` 声明 `acceptedInputTypes: ["text", "image"]`，说明图片输入在插件声明层已进入官方能力面。
  - 权限包含 `clipboard.read`、`network.internet`、`intelligence.basic`、`storage.plugin`、`window.create`，并把 `window.create` 用于图片翻译结果窗口。
- `plugins/touch-translation/index/main.ts`
  - `extractImageDataUrl()` 从 `TuffQuery.inputs` 中提取 `type === "image"` 且 `content` 为 `data:image/` 的输入。
  - `resolveTextToTranslate()` 在 `screenshot-translate` 无文本但有图片时调用 `vision.ocr`，OCR 空结果返回 `NO_INPUT_OCR_MESSAGE`。
  - `translateImageFromClipboardInput()` 对图片输入调用 `image.translate.e2e`，成功 payload 带 `provider`、`model`、`traceId`、`sourceText`、`targetText`，失败 payload 写入归一化错误。
  - 图片翻译结果优先尝试打开 DivisionBox；失败时回落成 CoreBox item，属于可见结果路径。
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
  - `translateClipboardImage()` 对空剪贴板图片返回 `IMAGE_UNAVAILABLE`。
  - `translateCoreBoxImageItem()` 对非图片 item 返回 `INVALID_ITEM`，对不可读图片源返回 `IMAGE_UNAVAILABLE`。
  - `translateImageBase64()` 调用 `corebox.screenshot.translate` scene，scene 调用或译图提取失败返回 `SCENE_UNAVAILABLE`，译图 payload 无效返回 `IMAGE_UNAVAILABLE`。
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
  - OCR job 会对 data URL、剪贴板图片和文件图片做大小限制，超过 `MAX_OCR_IMAGE_BYTES` 时抛出明确错误。
  - OCR 成功持久化时记录 `payloadHash` / `textHash`、原始文本长度、截断状态、provider / model / usage 等元信息，说明隐私 redaction 不是空口号。
- `plugins/touch-intelligence/index.js`
  - 剪贴板图片问答路径先调 `vision.ocr` 再调 `text.chat`，OCR 空结果会抛 `OCR_EMPTY`，错误 item 会带当前 capability 语义。

## 结论

主文档的判断成立：Tuff 已经有图片 OCR / 图片翻译的真实代码路径，不应被描述成“从零补能力”；但这些路径还没有形成竞品级的用户可见闭环，也不能被描述成“已完整对齐 Raycast / Alfred / uTools”。

当前事实链路是：

1. 插件声明层：`touch-translation` 的 `screenshot-translate` 已明确接受 `image` 输入，并声明了 AI、网络、剪贴板和窗口权限。
2. 插件执行层：图片输入可走 `vision.ocr` 提取文本，也可走 `image.translate.e2e` 直接生成译图；成功结果已有 provider / model / traceId 字段。
3. CoreBox 层：图片 item 与当前剪贴板图片都能进入 `corebox.screenshot.translate` scene；空图片、无效图片和 scene 不可用都有机器可读错误码。
4. OCR 后台层：OCR service 对图片大小、payload hash、文本截断、raw hash 有明确处理，符合主文档“不落原图 / 全文、只存 hash / 截断 / 引用”的隐私方向。

真正缺口在 evidence 产品化，而不是底层调用：

- `touch-translation` 的 image input 只接受 data URL，尚未覆盖文件图片路径 / screenshot capture 的完整用户入口。
- `CoreBox image-translate.ts` 有 `IMAGE_UNAVAILABLE` / `SCENE_UNAVAILABLE`，但主文档要求的 inputSource、image hash、mime、size、sceneId、provider health、fallbackUsed 还没有统一写入用户可见 evidence。
- OCR service 的 hash / 截断做得更完整，但它仍偏后台 job，不等于前台“截图 OCR 翻译命令”已经验收。
- `touch-intelligence` 已有 OCR 后 AI 问答链路，但它和 `touch-translation` / CoreBox 图片翻译还没有共享 `InputSourceEnvelope` 与 `ProviderEvidence`。

因此，主文档建议 `clipboard-image-ocr-translate-v1` 先补 packaged Electron 剪贴板图片样本、空图片失败态、scene unavailable、size limit 和 provider evidence，是正确且足够小的下一步。这里不需要先引入完整工作流引擎，也不需要复制 uTools 鼠标超级面板。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。现有文档对该映射点的表述保持了正确边界：源码路径存在，但 release evidence、输入来源标注、provider / scene failure 展示、packaged 剪贴板图片验收仍未闭环。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-08.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
