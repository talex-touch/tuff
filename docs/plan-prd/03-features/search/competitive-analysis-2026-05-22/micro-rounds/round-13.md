# 微审计 13/70

## 审计主题

Assistant 剪贴板图片翻译是否能作为 Raycast Translate / uTools OCR 翻译 / Alfred 图像工作流的一个真实映射点。

本轮只审一个窄点：Tuff 当前 `AssistantEvents.voice.translateScreenshot`、VoicePanel 按钮、CoreBox 图片翻译 helper 与 `image.translate.e2e` scene 是否形成了“剪贴板图片 -> 图片翻译 -> pin window / 剪贴板输出 -> 可见失败原因”的最小闭环；同时确认它是否被主文档错误夸大成“主动截屏翻译”。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
  - 第 1 节把截图 / 图片翻译列为 Tuff 当前已有代码路径，但明确仍缺 packaged Electron 剪贴板图片、截图权限与 fallback 样本。
  - 第 3 节把 `touch-translation`、OCR service、CoreBox image translate、Assistant VoicePanel 与 `image.translate.e2e` 统一放入 Translate / OCR / AI command 能力快照。
  - 第 4 节区分 `clipboard image` 与 `screenshot`：剪贴板图片路径已存在，主动截图仍受权限、平台和 evidence 约束。
  - 第 7.2 节建议 `clipboard-image-ocr-translate-v1` 首版覆盖 clipboard image、CoreBox image item 与 file image，并要求 `IMAGE_UNAVAILABLE`、`SCENE_UNAVAILABLE`、provider health 等失败证据。
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
  - UI 函数名为 `translateClipboardImage()`，按钮文案来自 `assistant.voicePanel.translateScreenshot`，当前中文实际显示为“剪贴板图片翻译”。
  - 点击后通过 typed transport 发送 `AssistantEvents.voice.translateScreenshot`，payload 只带 `targetLang: "zh"`。
  - 失败会调用 `formatScreenshotTranslateError()`，把 `ASSISTANT_DISABLED`、`IMAGE_UNAVAILABLE`、`SCENE_UNAVAILABLE` 映射到本地化恢复提示。
- `packages/utils/transport/events/assistant.ts`
  - `AssistantEvents.voice.translateScreenshot` 是 typed event，event name 为 `assistant:voice-panel:translate-screenshot`。
  - response 类型显式包含 `success`、`translatedImageBase64`、`sourceText`、`targetText`、`error`、`code`。
  - error code 仍保留 `SCREENSHOT_UNAVAILABLE`，但当前主路径实际使用 `IMAGE_UNAVAILABLE` / `SCENE_UNAVAILABLE`。
- `apps/core-app/src/main/modules/assistant/module.ts`
  - handler 注册在 `AssistantEvents.voice.translateScreenshot`。
  - `handleScreenshotTranslate()` 先检查 Assistant 与 floating ball 是否启用；禁用时返回 `ASSISTANT_DISABLED`。
  - 成功路径调用的是 `translateClipboardImage(targetLang || "zh", { openPinWindow: true })`，不是主动截图服务。
  - 图片不可用时统一返回 `IMAGE_UNAVAILABLE`，scene 不可用时返回 `SCENE_UNAVAILABLE`。
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
  - `translateClipboardImage()` 直接读取 Electron clipboard image；空图片返回 `IMAGE_UNAVAILABLE`。
  - `translateCoreBoxImageItem()` 可从 CoreBox image item 的 raw content 读取 data URL 或本地文件路径。
  - `translateImageBase64()` 调用 `runNexusScene(COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID, ...)`；非 pin window 路径声明 capability 为 `image.translate.e2e`。
  - scene 调用失败或无译图 payload 返回 `SCENE_UNAVAILABLE`；译图 payload 无效返回 `IMAGE_UNAVAILABLE`。
  - `openPinWindow: true` 时打开图片翻译 pin window，否则把译后图片写回系统剪贴板。
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
  - `coreBoxImageTranslateEvent` 只接受带 `item` 的请求，缺 item 时返回 `INVALID_ITEM`。
  - 该 IPC 路径复用 `translateCoreBoxImageItem()`，说明 CoreBox image item 与 Assistant clipboard image 使用同一底层图片翻译 helper。
- `plugins/touch-translation/manifest.json`
  - `screenshot-translate` feature 声明 `acceptedInputTypes: ["text", "image"]`，权限包含 `clipboard.read`、`intelligence.basic`、`window.create`。
  - manifest 文案仍叫“截图翻译”，但声明层已有 image input，适合与剪贴板图片 / Context Actions 对齐。
- `plugins/touch-translation/index/main.ts`
  - `translateImageFromClipboardInput()` 会从 `TuffQuery` 提取 image data URL，调用 Intelligence SDK 的 `image.translate.e2e`。
  - 成功结果包含 translated image、sourceText、targetText、provider、model、traceId；失败会写入 widget error payload。
  - AI 权限不足时返回明确错误 payload，而不是空结果。
- `apps/core-app/src/main/modules/assistant/module.contract.test.ts`
  - 合同测试确认 Assistant 截图翻译路径必须经过 typed assistant transport event。
  - 测试明确要求 `module.ts` 包含 `translateClipboardImage`，并且不再包含直接 `translateImageBase64` 或旧截图服务调用。
  - 测试还要求 VoicePanel 对图片不可用和 provider 不可用有本地化恢复提示。

## 结论

主文档关于“剪贴板图片 / CoreBox image item 的图片翻译路径存在，但主动截图与 packaged evidence 尚未闭环”的判断成立。

当前真实链路是：

1. Assistant VoicePanel 提供一个用户可见入口，当前文案是“剪贴板图片翻译”。
2. Renderer 通过 typed `AssistantEvents.voice.translateScreenshot` 发送请求。
3. Main 侧 `handleScreenshotTranslate()` 不再直接调用截图服务，而是读取当前系统剪贴板图片。
4. 底层复用 CoreBox `image-translate.ts`，把图片 base64 送入 `corebox.screenshot.translate` scene / `image.translate.e2e` capability。
5. 成功时打开 pin window 或写回剪贴板；失败时返回 `ASSISTANT_DISABLED`、`IMAGE_UNAVAILABLE`、`SCENE_UNAVAILABLE` 等明确 code。
6. `touch-translation` 插件侧也有 image input -> `image.translate.e2e` 的 parallel path，可作为后续 Context Actions / AI Command template 的插件样本。

这条链路足以支撑 Raycast Translate / uTools OCR 翻译 / Alfred 图像工作流的一个最小映射点：用户复制图片或让 CoreBox 聚焦 image item 后，可以触发图片翻译，并获得译图、识别文本和失败原因。

但它不能被描述成完整“截图翻译”产品闭环。当前边界很明确：

- Assistant 主路径读取的是剪贴板图片，不是主动截取屏幕区域。
- event 名和部分类型仍叫 `translateScreenshot` / `SCREENSHOT_UNAVAILABLE`，属于命名漂移；UI 文案和实际实现已经收敛到 clipboard image。
- `openPinWindow: true` 路径没有显式传 `capability: "image.translate.e2e"`，依赖 scene 自身处理；这不一定是错误，但后续 evidence 需要展示 scene id、provider/model、traceId。
- 还缺 packaged Electron 下真实剪贴板图片样本、无图片样本、provider unavailable 样本、截图权限拒绝样本。
- 主动截图、OCR fallback、file image size limit、隐私 redaction 仍应作为 `clipboard-image-ocr-translate-v1` 的验收项，而不是现状已完成项。

因此，后续最小路径应继续复用当前 helper 与 typed event，不要新增一套图片翻译通道；需要补的是输入来源命名、provider evidence、失败 reason 展示和 packaged 样本。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。`07-translation-ocr-ai-commands.md` 已经把该能力写成“代码路径存在，但仍缺 packaged Electron 剪贴板图片、截图权限、fallback 样本”，没有把现状夸大为完整截图翻译。

本轮发现的只是源码命名层面的轻微漂移：typed event 仍叫 `translateScreenshot`，而实际路径和 UI 文案是剪贴板图片翻译。这个漂移可以留给后续源码清理，不需要改主文档。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-13.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
