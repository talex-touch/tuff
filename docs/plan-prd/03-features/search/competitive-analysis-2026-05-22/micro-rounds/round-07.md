# 微审计 07/70

## 审计主题

剪贴板图片翻译是否已经有真实可触发链路，并且主分析文档把缺口定位为 packaged evidence / 可见失败态，而不是把它误判为“功能不存在”或“已完整闭环”。

本轮只审一个具体映射点：Raycast / Alfred / uTools 中“图片上下文可触发 OCR / 翻译 / AI 动作”的心智，是否能映射到 Tuff 当前 `touch-translation` 的 `screenshot-translate` image input 与 CoreBox `translateClipboardImage()` 链路。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
  - 第 3/4 节把 OCR / 翻译标为“部分落地，需要 evidence”，证据路径包括 `plugins/touch-translation`、`ocr-service.ts`、`core-box/image-translate.ts`。
  - 同节明确缺口是剪贴板图片、截屏翻译、provider fallback、权限拒绝真机 evidence，而不是基础能力完全缺失。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节建议 `context-actions-v1` 首批只覆盖 selected text、clipboard image、files。
  - 第 6 节将 `touch-translation`、OCR service、Assistant 剪贴板图片翻译定位为已有路径，但要求 empty clipboard、scene unavailable、provider fallback 等失败态可见。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
  - 第 3 节说明 `touch-translation` manifest 已声明截图翻译支持 `acceptedInputTypes: ["text", "image"]`，图片翻译执行路径存在但缺真实剪贴板图片 / 截图权限 evidence。
  - 第 4/5 节把 `clipboard image` 映射到 `touch-translation` screenshot、CoreBox `translateClipboardImage()`、Assistant VoicePanel，并要求 source、provider health、empty-image、fallback reason。
  - 第 7.2 节的 `clipboard-image-ocr-translate-v1` 要求 evidence 包含 image hash、mime、size、inputSource、sceneId、capability、provider/model/traceId、OCR text length、failure code；验收样本包括无图片、成功 pin window、scene unavailable、packaged Electron 截图/日志。
- `plugins/touch-translation/manifest.json`
  - required permissions 包含 `clipboard.read`、`network.internet`、`intelligence.basic`、`storage.plugin`、`window.create`。
  - `screenshot-translate` 声明 `experimental: true`，并声明 `acceptedInputTypes: ["text", "image"]`，说明 image input 不是文档假设。
- `plugins/touch-translation/index/main.ts`
  - `extractImageDataUrl()` 从 `query.inputs` 中提取 `type === "image"` 且 `content` 为 `data:image/` 的输入。
  - `resolveTextToTranslate()` 在 `screenshot-translate` 没有直接文本时，可对 image data URL 调 `vision.ocr`，OCR 为空或失败时返回可展示错误。
  - `translateImageFromClipboardInput()` 对 image data URL 调 `image.translate.e2e`，成功 payload 带 `provider`、`model`、`traceId`，失败会进入 image translation widget 的 error 状态。
  - `onFeatureTriggered()` 优先尝试 `screenshot-translate` 的 image translation，再回落到文本/OCR 翻译路径。
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
  - `translateClipboardImage()` 读取当前系统剪贴板图片；空图片返回 `IMAGE_UNAVAILABLE`。
  - `translateImageBase64()` 调用 `corebox.screenshot.translate` scene；scene 调用失败或无结果返回 `SCENE_UNAVAILABLE`；成功后可写回剪贴板或打开 pin window。
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.test.ts`
  - 已覆盖当前剪贴板图片成功打开 pin window 的路径。
  - 已覆盖空剪贴板图片返回 `IMAGE_UNAVAILABLE`，并确认不会调用 scene、不会打开 pin window、不会写剪贴板。

## 结论

主文档判断成立：Tuff 当前确实存在剪贴板图片 / image input 翻译的真实链路，但还不能宣称已经完成 Raycast / Alfred / uTools 级别的上下文动作闭环。

当前事实链路是：

1. Manifest 层：`screenshot-translate` 明确接收 `text` 与 `image`，并声明了 clipboard、network、intelligence、window 等必要权限。
2. 插件层：`touch-translation` 可从 `TuffQuery.inputs` 取 image data URL；可直接走 `image.translate.e2e`，也可先走 `vision.ocr` 再进入文本翻译。
3. CoreBox 层：`translateClipboardImage()` 能直接读取当前剪贴板图片，成功时打开 pin window 或写回剪贴板，空剪贴板与 scene unavailable 都有明确错误码。
4. 测试层：已有单测覆盖成功 pin window 与空剪贴板失败两条关键路径。

因此，主分析文档没有把“规划能力”误写成“源码不存在的能力”。它的边界也没有夸大：文档持续强调缺的是 packaged Electron 下真实剪贴板图片样本、provider / model / trace 可见化、失败 reason 展示、权限拒绝与 scene unavailable 的用户可恢复动作。

后续如果落 `context-actions-v1` 或 `translate-ai-evidence-v1`，应直接复用这两条现有路径，而不是新增平行图片翻译入口：

- 插件上下文输入：`screenshot-translate` + `TuffQuery.inputs.image`。
- CoreBox 当前剪贴板输入：`translateClipboardImage()` + `corebox.screenshot.translate` scene。

首批验收仍应保持小口径：empty clipboard、成功 pin window、scene unavailable、provider failure、permission denied、packaged Electron 真实截图/日志。不要把 OCR、翻译 provider 编排、AI Command 模板和鼠标超级面板一起做成大重构。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。文档对剪贴板图片翻译的表述符合源码事实：路径存在、仍缺 evidence；它没有把 `screenshot-translate` 宣称为稳定完整产品闭环，也没有遗漏 CoreBox 当前剪贴板图片翻译路径。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-07.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
