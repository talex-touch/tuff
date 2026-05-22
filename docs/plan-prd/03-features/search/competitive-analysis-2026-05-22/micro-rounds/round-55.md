# 微审计 55/70

- 审计主题

截图复制动作是否已经等价于 Raycast Translate / uTools OCR 场景里的“截图后直接 OCR/翻译”能力；重点核对 Tuff 当前 `SystemActionsProvider` 的截图动作、native screenshot service、CoreBox 图片翻译与 Assistant 剪贴板图片翻译之间的边界，避免把“能截图并写入剪贴板”误写成完整截图翻译输入合同。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
   - 第 6.1 节把 `screenshot-region` 放在后置输入来源，要求 `window.capture` 与屏幕录制 evidence，说明截图区域输入不是当前 v1 已完成能力。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
   - 第 3 / 4 / 5 节区分 `clipboard image`、`screenshot`、`file image` 三类来源。
   - 文档把 `ClipboardImageTranslateCommand` 与 `ScreenshotTranslateCommand` 分开：前者围绕当前剪贴板图片，后者才是 capture -> ocr -> translate -> overlay / pin 的完整截图翻译链。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 59 条要求分别验证截图、剪贴板图片和文件图片，结论是 coverage 足够但仍需 evidence。
4. `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
   - `SCREENSHOT_ACTION_KEYWORDS` 会把 `screenshot` / `截图` / `截屏` 等查询映射为 `screenshot-cursor-display`。
   - 执行该 action 时只调用 `getNativeScreenshotService().capture({ target: "cursor-display", output: "tfile", writeClipboard: true })`。
5. `apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts`
   - `capture()` 支持 `cursor-display`、`display`、`region` 等 native capture 目标，并可输出 `tfile` / `data-url`。
   - 当 `writeClipboard` 为 true 时只把图片写入系统剪贴板；该 service 本身不调用 `vision.ocr`、`image.translate.e2e` 或 `corebox.screenshot.translate`。
6. `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
   - `translateClipboardImage()` 读取当前 Electron clipboard image，空图片返回 `IMAGE_UNAVAILABLE`。
   - `translateImageBase64()` 调用 `COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID` / `corebox.screenshot.translate`，成功后写回剪贴板或打开 pin window。
7. `apps/core-app/src/main/modules/assistant/module.ts` 与 `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
   - VoicePanel 的用户文案是“剪贴板图片翻译” / `Translate clipboard image`。
   - 后端 `handleScreenshotTranslate()` 实际调用 `translateClipboardImage()`，说明当前 Assistant 入口消费的是已有剪贴板图片，而不是主动截图区域。
8. `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.test.ts`
   - 单测断言 `截图` 查询只创建并执行截图复制动作，且 native capture 参数为 `target: "cursor-display"`、`output: "tfile"`、`writeClipboard: true`。

- 结论

主文档对该映射点的边界判断成立：Tuff 当前已有 native screenshot primitive，也已有剪贴板图片翻译链路，但二者还没有合并成完整的“截图区域 -> OCR / 图片翻译 -> 结果可见 -> 失败可恢复”合同。

已经成立的部分：

1. CoreBox 可以通过关键词召回截图动作，并把当前光标所在显示器截图写入临时文件和系统剪贴板。
2. CoreBox / Assistant 可以读取当前剪贴板图片，进入 `corebox.screenshot.translate` scene，并用 `IMAGE_UNAVAILABLE` / `SCENE_UNAVAILABLE` 表达空图片或 scene 不可用。
3. Native screenshot service 已经有 region capture 的底层参数模型，为后续 `screenshot-region` 输入来源提供技术底座。

不能夸大的部分：

1. `screenshot-cursor-display` 只是截图复制动作，不会自动触发 OCR、翻译或 provider evidence 记录。
2. Assistant 入口虽然内部事件名仍带 `translateScreenshot`，但实际消费的是剪贴板图片；用户文案也已经收敛为剪贴板图片翻译。
3. 当前没有看到统一的 `ScreenshotTranslateCommand` 执行链把主动截图、权限拒绝、OCR 空结果、provider 不支持、pin window evidence 串成一个可验收动作。
4. 因此 Raycast Translate / uTools OCR 对标时，应继续把 `clipboard image translate` 视为已有链路，把 `screenshot-region translate` 视为后置 evidence / contract 缺口。

最小后续方向仍应沿主文档：复用 native screenshot service 和 `translateImageBase64()`，补一个显式 `capture -> translate` 命令或 Context Action，并记录 source、permission、image size / hash、provider、traceId、failure reason；不要把现有截图复制动作包装成完整截图翻译能力。

- 是否发现需修正的主文档问题

否。`04`、`07`、`11` 对截图输入的表达与 live tree 一致：它们没有把当前截图动作宣称为完整 OCR / 翻译闭环，而是把截图区域、权限拒绝、packaged evidence、provider failure reason 放在后续验收范围。源码核对只强化了这个边界，没有发现需要修改 `01-11` 主分析文档的问题。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-55.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
