# 微审计 59/70

- 审计主题

OCR / 图片翻译是否已经区分截图、剪贴板图片和文件图片三类输入源；重点映射 Raycast Translate/OCR、Alfred OCR Workflow / Universal Actions、uTools OCR / 超级面板对“当前图片从哪里来、失败时为什么失败”的要求，避免把“能处理图片 base64”误写成完整 OCR 输入源合同。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
   - 总结部分明确把 typed query、selected text、clipboard image、screenshot、file image、manual parameter 归入同一条 Translation/OCR/AI Command 输入链。
   - 当前能力表把 `screenshot-translate`、`image.translate.e2e`、`corebox.screenshot.translate`、`ocr-service.ts` 分开描述：前台图片翻译入口存在，但 packaged 剪贴板图片、截图权限、fallback 样本仍缺。
   - 输入源矩阵明确要求 `clipboard image` 只做临时 payload，run record 存 hash/size/mime；`screenshot` 要覆盖屏幕录制/截图权限拒绝；`file image` 要有路径权限、文件过大、8 MiB blocked reason。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 59 条判断 OCR 需要分别验证 selected text、clipboard image、screenshot、provider failed，并将 `image-translate.ts`、`ocr-service.ts`、`TuffQuery.inputs` 作为锚点。
3. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffInputType.Image` 明确是 data URL 格式图像输入，`TuffInputType.Files` 是 JSON 序列化文件路径数组。
   - `TuffQuery.text` 与 `TuffQuery.inputs` 的注释区分主动输入文本和剪贴板/其他来源附加输入，为图片 OCR / 翻译来源标注提供底座。
4. `plugins/touch-translation/manifest.json`
   - `screenshot-translate` 声明 `acceptedInputTypes: ["text", "image"]`，关键词包含 `screenshot`、`截图`、`ocr`、`识别`，但 feature 仍标记为 `experimental: true`。
   - 权限包含 `clipboard.read`、`intelligence.basic`、`window.create`，说明图片翻译路径依赖剪贴板、AI 能力和结果展示窗口。
5. `plugins/touch-translation/index/main.ts`
   - `extractImageDataUrl()` 只从 `query.inputs` 中提取 `type === "image"` 且 `content` 为 `data:image/` 的输入。
   - `resolveTextToTranslate()` 在 `screenshot-translate` 没有文本时，会从 image data URL 调 `vision.ocr`，OCR 空结果返回 `NO_INPUT_OCR_MESSAGE`。
   - `translateImageFromClipboardInput()` 对 image data URL 调 `image.translate.e2e`，并把 provider / model / traceId 写入展示 payload。
   - 该插件路径能处理 CoreBox 传入的 image data URL，但没有自己完成截图 capture，也没有处理 `files` 类型中的图片路径。
6. `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
   - `translateCoreBoxImageItem()` 只接受 `kind === "image"` 的 item，并从 `meta.raw.content` 读取 data URL 或本地文件路径。
   - `translateClipboardImage()` 直接读取当前 Electron clipboard image；空图片返回 `IMAGE_UNAVAILABLE`。
   - `translateImageBase64()` 统一调用 `corebox.screenshot.translate` scene，失败归一成 `SCENE_UNAVAILABLE`，成功后写剪贴板或打开 pin window。
7. `apps/core-app/src/main/modules/box-tool/core-box/image-translate.test.ts`
   - 已覆盖 clipboard history image item、本地图片路径 item、当前剪贴板图片、空剪贴板图片、raw base64、data URL 归一化、scene request failed。
   - 测试证明“剪贴板图片”和“图片 item / 文件路径”两条 CoreBox 图片翻译路径存在，但测试名里的 screenshot scene 主要是 scene id，不等于真实屏幕截图 capture evidence。
8. `apps/core-app/src/main/modules/ocr/ocr-service.ts`
   - `buildJobPayload()` 对 clipboard `image` 支持 data URL 和图片文件路径；对 clipboard `files` 会取首个图片文件；文本剪贴板不入 OCR job。
   - `normalizeSourceForAgent()` 再次校验 data URL、clipboard image、clipboard files、直接 file source，并统一 8 MiB 上限。
   - OCR 成功持久化时记录 `payloadHash` / `textHash` / `originalTextLength` / `textTruncated` / `rawHash` / `rawSnippet` / provider / model，说明后台 OCR 已有隐私与可追踪字段。

- 结论

主文档对该映射点的判断成立：Tuff 当前已经有多条 OCR / 图片翻译输入链，但还没有把截图、剪贴板图片、文件图片统一成用户可见的 `InputSourceEnvelope` 和 packaged evidence。

已经成立的能力边界比较清楚：

1. **剪贴板图片**：CoreBox 可以直接从 Electron clipboard 读取图片并调用 `corebox.screenshot.translate`；`touch-translation` 也能从 `TuffQuery.inputs` 的 image data URL 调 `image.translate.e2e` 或 `vision.ocr`。
2. **文件图片 / 图片 item**：CoreBox image item 可从 `meta.raw.content` 读取 data URL 或本地文件路径；OCR service 可从 clipboard image 文件路径或 clipboard files 中的首个图片文件排队。
3. **失败态不是纯空结果**：空剪贴板图片返回 `IMAGE_UNAVAILABLE`，scene 调用失败返回 `SCENE_UNAVAILABLE`，OCR service 对文件不存在、超过 8 MiB、无图片文件、provider/network/native OCR 不可用都有具体错误或 retry reason。
4. **后台 OCR 隐私字段已有基础**：OCR job/result 不只保存原始文本，还记录 hash、长度、截断状态、provider/model 和 payload checksum，符合主文档“原图/全文不应进入普通日志”的方向。

尚未闭环的地方也不能被主文档忽略：

1. `screenshot-translate` 的名称和 scene id 容易让人误以为已经完成真实截图 OCR；源码核对显示当前插件入口主要消费 `TuffQuery.inputs` 的 image data URL，真实截图 capture、权限拒绝、Wayland/macOS 权限差异仍需要 packaged evidence。
2. `touch-translation` 没有消费 `TuffInputType.Files`，所以文件图片路径更多落在 CoreBox image item / OCR service 后台队列，而不是同一个前台翻译插件合同。
3. 现有展示 payload 包含 provider/model/traceId，但还缺统一 `inputSource: clipboard-image | screenshot | file-image`、image hash、mime、size、failure code 的前台 evidence。
4. OCR service 的 file path hash 当前是 path hash，不是文件内容 hash；这对去重和隐私足够轻量，但不能被写成“已校验图片内容完整性”。

因此后续最小改进应继续沿 `07` 的 `InputSourceEnvelope` / `ProviderEvidence` / `PrivacyRedactionPolicy` 方向：先为 clipboard image、real screenshot、file image 三个样本补 source label、size/hash/mime、provider/model/traceId、权限拒绝和 8 MiB blocked reason，再考虑把 OCR step 暴露到 workflow。不要先重写截图系统，也不要把 `screenshot-translate` 当前实验入口包装成完整 Raycast / uTools OCR parity。

- 是否发现需修正的主文档问题

否。`07` 与 `11` 没有把当前能力夸大成完整 OCR 体验；它们已经明确区分 clipboard image、screenshot、file image，并把真实截图权限、packaged evidence、provider failed、8 MiB blocked reason、输入来源标注列为后续验收项。源码核对只补充了一个口径注意点：`corebox.screenshot.translate` 是 scene id / 能力名，不应单独作为真实截图 capture 已闭环的证据。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-59.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
