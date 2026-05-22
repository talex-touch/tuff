# 微审计 54/70

- 审计主题

`window.create` 在 Tuff 中的语义是否被正确定位为“插件创建受控展示窗口 / 图片翻译结果窗口”，而不是 Raycast Window Management 式系统窗口编排能力；重点核对 `touch-translation` 的图片翻译 pin window、插件 Window SDK 与权限声明边界。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - Window Management 行把当前 Tuff 映射到 `touch-window-manager`、`touch-window-presets`、`touch-quick-actions`，并要求保留 capability metadata、unsupported reason 和 Windows/macOS/Linux evidence。
   - Action / Evidence 合同示例里出现 `window.create`，但语义是某个动作所需权限，不是系统窗口管理已完成。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/07-translation-ocr-ai-commands.md`
   - `touch-translation` manifest 被列为翻译 / OCR / 图片结果窗口证据；权限包含 `window.create`。
   - 失败码矩阵把 `window.create` / `window.capture` 权限拒绝列为 `PERMISSION_DENIED`，要求显示授权动作并 blocked，不应静默空结果。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
   - Window Management 与 System Actions 被标为部分落地，窗口 preset 需要多屏、权限拒绝和平台 unsupported evidence。
   - 这说明系统窗口管理仍应走平台能力和 shell/native evidence，不应由 `window.create` 权限替代。
4. `packages/utils/plugin/sdk/window/index.ts`
   - `createWindow()` 只把插件传入的 `file` / `url` / BrowserWindow options 发送到 `PluginEvents.window.new`。
   - `toggleWinVisible()` 与 `setWindowProperty()` 也只作用于插件窗口 id，事件为 `window:visible` 和 `window:property`。
5. `packages/utils/permission/registry.ts`
   - `window.create` 是 `PermissionCategory.WINDOW` 下的 low risk 权限，说明是创建窗口或视图。
   - `window.capture` 独立定义为 high risk，说明截图 / 屏幕捕获不能混入 `window.create`。
6. `apps/core-app/src/main/modules/plugin/plugin-module.ts`
   - `PluginEvents.window.new` handler 会根据当前插件上下文查找 `touchPlugin`，通过 `TouchWindow` 创建窗口，加载插件提供的 `file` 或 `url`，注入插件 preload / styles / js。
   - 新窗口被记录到 `touchPlugin._windows`，`visible` / `property` 后续也只查这个插件自己的窗口表。
7. `plugins/touch-translation/manifest.json`
   - required permissions 包含 `window.create`，permission reason 是“打开 DivisionBox 独立窗口展示图片翻译结果”。
   - `window.create` 与 `clipboard.read`、`network.internet`、`intelligence.basic`、`storage.plugin` 并列，是翻译结果展示链路的一部分。
8. `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
   - `openPinWindow` 为 true 时，图片翻译成功后调用 `openImageTranslatePinWindow()`；否则把翻译后的图片写回剪贴板。
   - 场景失败会返回 `SCENE_UNAVAILABLE`，图片无效会返回 `IMAGE_UNAVAILABLE`，没有把窗口展示失败写成成功。
9. `apps/core-app/src/main/modules/box-tool/core-box/image-translate-pin-window.ts`
   - pin window 是一个受控 `TouchWindow`，`alwaysOnTop: true`，`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，加载的是内联结果 HTML。
   - 这更接近“翻译结果展示窗口”，不是外部应用窗口移动、分屏、置顶或多屏 preset 管理器。
10. `packages/utils/__tests__/plugin-window-sdk.test.ts`
    - 测试确认插件 Window SDK 使用 `PluginEvents.window.new/visible/property` 这组三个共享事件，说明 SDK surface 已固定在插件窗口操作上。

- 结论

主文档对该边界的处理是准确的：`window.create` 是 Tuff 插件展示窗口能力的一部分，不应被当成 Raycast Window Management parity。

已经成立的事实有四点：

1. 插件 SDK 的 `createWindow()` 只创建当前插件上下文下的受控窗口，并返回窗口 id。
2. CoreApp 主进程把新窗口挂到 `touchPlugin._windows`，后续显隐和属性修改也只作用于这个插件自己的窗口。
3. `touch-translation` 使用 `window.create` 的理由是展示图片翻译结果窗口；图片来源、AI 翻译、剪贴板写入和 pin window 展示仍分别由各自权限 / 场景负责。
4. `window.create` 与 `window.capture` 在权限表里风险等级和用途分离，因此截图、OCR、屏幕捕获、外部窗口管理都不能借 `window.create` 兜底。

因此后续最小改进不应扩大 `window.create` 的含义，也不应把它宣传成系统窗口管理能力。更准确的 evidence 是两类分开验收：

1. 插件展示窗口 evidence：`touch-translation` 图片翻译成功打开 pin window、窗口 id 生命周期、关闭后清理、权限拒绝 blocked。
2. 系统窗口管理 evidence：`touch-window-manager` / `touch-window-presets` 的 Windows 多屏、macOS permission denied / best-effort、Linux unsupported reason。

- 是否发现需修正的主文档问题

否。`02`、`07`、`09` 与 `11` 没有把 `window.create` 夸大成完整 Window Management；它们把系统窗口管理继续放在平台能力、permission reason、unsupported / degraded evidence 下，同时把 `window.create` 用作插件展示窗口或图片翻译结果窗口权限，和源码事实一致。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-54.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
