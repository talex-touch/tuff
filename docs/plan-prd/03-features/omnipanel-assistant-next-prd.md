# PRD: OmniPanel 与悬浮助手下一版本

> 更新时间：2026-07-13
> 状态：MVP implementation slice landed / packaged evidence pending
> 目标窗口：2.5.x Beta 后续，不能抢 2.5.0 Stable 的 CoreBox 文本 + OCR 收口
> 关联 Roadmap：`../04-implementation/Roadmap-vNext-2026-06-18.md`
> 关联 AI PRD：`./ai-2.5.0-plan-prd.md`

## 1. 结论

OmniPanel 和悬浮助手不应做成两个互相竞争的入口。下一版本应将 OmniPanel 定位为“上下文动作面板”，将悬浮助手定位为“轻量入口 + 状态承载 + 截图翻译前台”，共同服务于本地优先、AI-native、Plugin-extensible 的桌面操作流。

当前市面成熟路径已经很清晰：

- Raycast / PopClip 代表“选中文本后立即出现动作”的高频效率范式。
- PowerToys / Apple Live Text 代表“截图、OCR、剪贴板转换”正在变成系统级基础能力。
- Snipaste 代表“截图后贴回屏幕”的强心智，适合参考 pin window 与视觉结果驻留。

Tuff 的优势不是复制一个更大的悬浮聊天窗，而是把已有 typed transport、插件 runtime、Native Screenshot、Nexus Scene、CoreBox 和本地 SoT 串成低打扰、可解释、可回退的桌面动作链。

## 2. 市场情况与适配度

| 产品 / 能力                               | 市场信号                                                                       | 对 Tuff 的启发                                                                           | Tuff 适配度                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raycast AI Commands / Quick Fix           | 命令面板与选中文本 AI 改写、解释、命令化动作结合，强调快速执行与可自定义命令。 | OmniPanel 应强化“选区优先、动作可搜索、结果可复制/替换/重试”的写作工具闭环。             | 高：OmniPanel 已有选区捕获、AI preview、metadata chips 与内置 AI actions；Plugin Intelligence SDK 已补 first-class prompt options，`touch-intelligence@1.1.0` 提供 stateless Rewrite/Summarize/Explain，`1.2.0` 提供 bounded 本地自定义 command registry、动态 text/html feature、原子 reload 与 create/update/delete/import/export editor；输入按“显式命令后缀 > 附带 text/html 剪贴板输入”取值。模板变量预览、preset 分发与 current-version 采证仍开放。 |
| PopClip                                   | 选中文本后出现动作菜单，翻译、搜索、复制与扩展动作是主体验。                   | OmniPanel 的触发方式和轻量动作密度要对标 PopClip，但要保留 Tuff 的插件和 AI 上下文优势。 | 高：现有右键长按、快捷键、插件 auto-mount 与 feature registry 已具备基础。                                                                                                                                                                                                                                                                                                                                                                                 |
| PowerToys Text Extractor / Advanced Paste | OCR、剪贴板转换、AI opt-in、本地能力逐步成为桌面效率工具标配。                 | 截图功能要先做好 capture / clipboard / OCR / transform 的基础闭环，再逐步上 AI 翻译。    | 高：已有 NativeScreenshotService、clipboard image translate 与 Nexus image scene。                                                                                                                                                                                                                                                                                                                                                                         |
| Snipaste                                  | 截图 + 贴图是稳定心智，截图结果驻留在屏幕上比单纯复制更适合对照和翻译。        | 截图翻译结果应优先支持 pin window，不只写剪贴板。                                        | 中高：已有主动截图、区域选择、image-translate pin window、host copy/close、work-area 限界、缩放与透明度 controls；待 current-version 可见采证。                                                                                                                                                                                                                                                                                                              |
| Apple Live Text / macOS Translate         | 图片中文字可复制、搜索、翻译，用户已期待图像文本可交互。                       | Tuff 不必替代系统能力，但要在跨应用、插件动作和 provider fallback 上补足系统能力边界。   | 中高：macOS 可借助系统文本选择，跨平台仍需 Tuff 自有 OCR/截图链路。                                                                                                                                                                                                                                                                                                                                                                                        |

## 3. 当前项目基础

### OmniPanel

当前实现位于：

- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/shared/events/omni-panel.ts`

已具备能力：

- typed transport 事件：show / hide / feature list / execute / refresh。
- 触发：`CommandOrControl+Shift+P`、快捷键长按、右键长按。
- 选区捕获：macOS AXSelectedText 优先，失败后复制快捷键兜底，并恢复剪贴板快照。
- 上下文胶囊：选区、剪贴板文本、当前应用名、窗口标题、capturedAt、source。
- 内置动作：快速翻译、AI 翻译、AI 摘要、AI 改写、AI 解释、AI Review、网页搜索、CoreBox 搜索、复制。
- AI 预览：running / done / error、retry、copy、replace clipboard 二次确认、provider/model/trace/latency chips。
- 插件接入：feature registry、plugin feature auto-mount、declarative omniTransfer。
- Plugin System SDK 复用同一 host-owned selection service：`system.captureSelection()` / `captureSelectedText()` 在 verified identity + `clipboard.read` 后返回 text/support/issue/limitations/capturedAt；权限拒绝在 AX/shortcut/clipboard 前 fail-closed，fallback 保持全格式剪贴板恢复。

主要缺口：

- 当前 query 主要是 `text` 输入，`image/files/html` 还没有形成稳定上下文执行路径。
- AI actions 在 renderer 直接调用 intelligence client，缺少统一 action result contract 和可复用 Review Queue 入口。
- 截图/图片上下文没有进入 OmniPanel 的第一层动作模型。
- packaged visible evidence 仍在 R2 队列中，不能把 MVP 说成 Stable。

### 悬浮助手

当前实现位于：

- `apps/core-app/src/main/modules/assistant/module.ts`
- `apps/core-app/src/renderer/src/views/assistant/FloatingBall.vue`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `packages/utils/transport/events/assistant.ts`

已具备能力：

- 浮球默认关闭，受 `assistant.enabled` 与 `floatingBall.enabled` 控制。
- 浮球位置、尺寸、透明度、边距有设置补全与持久化。
- 拖动位置更新有 16ms 节流，持久化有 220ms debounce。
- 浮球与语音面板跨 workspace / fullscreen always-on-top。
- VoicePanel 可提交文本到 CoreBox。
- VoicePanel 可触发剪贴板图片翻译，并打开 pin window。
- VoicePanel 已通过 typed Assistant events 提供显示器列表、截图复制、保存和“截图并翻译”；默认捕获指针所在显示器，也可选择 `NativeScreenshotService.listDisplays()` 返回的指定显示器，三条截图动作共用同一 target payload，翻译结果继续复用 image translate scene 与 pin window。

主要缺口：

- historical packaged evidence 已覆盖 clipboard image translate、screenshot translate 与 pin window；当前版本仍需复采显示器选择、copy/save、permission-denied 恢复、provider fallback 等可见路径。
- 语音识别依赖浏览器 Web Speech，适合作为 Experimental，不能作为核心入口稳定承诺。
- 悬浮助手视觉偏独立，尚未和 OmniPanel / CoreBox 的动作模型统一。
- 常驻浮窗有打扰与性能风险，必须继续默认关闭、可解释、可快速退出。

### 截图与图片翻译

当前实现位于：

- `apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts`
- `packages/tuff-native/native-screenshot/src/lib.rs`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/image-translate-pin-window.ts`

已具备能力：

- Native screenshot addon 基于 `xcap`，支持 macOS / Windows / Linux。
- 支持 display / cursor-display / region capture。
- 支持 DIP 到物理像素转换、多显示器映射、写剪贴板、临时 tfile、data-url。
- 图片翻译支持 clipboard image、base64、CoreBox image item，并可打开置顶 pin window；pin window 按指针显示器 work area 居中限界，通过 host-owned context menu 复制译图/原文/译文、缩放、重置缩放、切换透明度或关闭，Esc、`Cmd/Ctrl+Shift+C` 与 `Cmd/Ctrl +/-/0` 提供键盘路径。
- 原生截图 Rust 测试与 JS contract 已有基础证据。

主要缺口：

- 主动截图与独立 typed capture / save / translate event 已覆盖 cursor-display / display / region；区域模式按指针或指定显示器懒加载透明 overlay，反向拖拽归一化到全局 DIP，Esc/右键/取消/超时均不触发截图。仍缺 current-version packaged 多显示器与取消路径 evidence。
- image translate scene 不可用时，Assistant 已降级到本地/系统 `vision.ocr` -> `text.translate`，在 VoicePanel 展示原文、译文与两阶段 provider/model；scene、OCR 或文本翻译不可用时会展示语义化恢复动作，通过 typed Assistant event 唤回主窗口并直达 Intelligence Channels，失败则保留可重试错误。仍缺 current-version packaged 成功/失败证据。
- capture 结果已展示显示器、尺寸、剪贴板和保存路径，OCR fallback 已展示 degraded reason 与 provider/model；image translate 成功路径已新增 scene run ID、总耗时和逐阶段 capability/provider/model/latency 可见反馈，provider 失败路径已具备一键渠道设置恢复，但仍缺 current-version packaged 证据。

## 4. 下一版本定位

### 产品定位

- OmniPanel：选区、截图、剪贴板与插件上下文的动作面板。
- 悬浮助手：默认关闭的轻量浮动入口，承载语音 Beta、截图翻译入口、运行状态和快速呼出。
- 截图能力：先作为基础能力接入 CoreBox / OmniPanel / 悬浮助手，再逐步增强 OCR、翻译、贴图、标注。
- 桌面烟花：轻量、可关闭、无业务依赖的视觉反馈能力，用于成功完成或手动触发，不成为主线功能。

### 非目标

- 不做一个常驻大聊天窗口。
- 不把 Web Speech 语音唤醒列为 Stable blocker。
- 不在 2.5.0 Stable 里承诺 OmniPanel、Assistant、Workflow 全部闭环。
- 不新增 raw ipc / raw event 字符串绕过 typed transport。
- 不把截图图片、OCR 文本、AI prompt/response 写入普通 JSON、localStorage、日志或明文 sync payload。
- 不做复杂截图编辑器，下一版本只做 capture / translate / pin / copy 的最近路径。

## 5. 范围分层

### P0：下一版 Beta 必须收口

1. OmniPanel packaged evidence：真实选中文本、AI preview、copy / retry / replace clipboard、失败恢复。
2. 悬浮助手入口收敛：浮球默认关闭、状态可解释、点击打开 VoicePanel、提交文本到 CoreBox 可见。
3. 截图底座入口：cursor-display / display / region capture、写剪贴板或 tfile 的 code path 已完成；当前版本 packaged evidence 仍开放。
4. 剪贴板图片翻译语义拆分：`translateClipboardImage`、`translateScreenshot`、`captureScreenshot` 与 `saveScreenshot` 已形成独立 typed events 和 UI 文案。
5. 性能 guardrail：全局 hook、浮球窗口、语音识别、截图服务均需 lazy / opt-in / debounce。

### P1：适合进入同一产品版本的小步增强

1. 区域截图 overlay：code path 已完成单显示器透明框选、typed submit/cancel、sender 校验、全局 DIP 映射与无副作用取消；仍需 packaged 多显示器/HiDPI 采证。
2. 截图翻译：MVP 已接通悬浮助手 VoicePanel -> cursor-display / selected display / region capture -> image.translate.e2e -> pin window；成功时展示 scene route metadata，pin window 提供 host-owned copy/close/zoom/opacity actions，scene 不可用时降级到 OCR 文本翻译卡片。下一步补 current-version packaged evidence。
3. OCR fallback：code path 已完成 capture -> `vision.ocr` -> `text.translate`、空文本/能力不可用 fail-closed、source/target/provider metadata 展示；真实 provider 与系统 OCR 组合仍需 packaged 采证。
4. OmniPanel 图片上下文：截图后可从 OmniPanel 看到“翻译截图 / OCR / 复制图片 / 贴图”等动作。
5. 烟花效果 MVP：可通过 CoreBox / OmniPanel command 手动触发，成功任务可 opt-in 触发。

### P2：后续，不抢下一版

1. 截图标注、马赛克、箭头、编号等编辑能力。
2. 截图历史库与搜索。
3. 多屏长截图、滚动截图。
4. Assistant 多轮聊天与多 Agent 面板。
5. 自动屏幕监控、实时划词翻译、后台 OCR watcher。

## 6. 功能需求

### FR-1：OmniPanel 上下文动作面板

用户故事：作为桌面重度用户，我希望选中文本后能快速打开动作面板，并直接翻译、摘要、改写、解释或转交 CoreBox，以减少跨应用复制粘贴。

验收标准：

1. WHEN 用户通过快捷键或右键长按打开 OmniPanel THEN 系统 SHALL 捕获选区文本并展示上下文来源、选区状态和可执行动作。
2. IF 选区捕获失败 THEN 系统 SHALL 展示明确恢复建议，不得把空选区当成功。
3. WHEN 用户执行 AI 动作 THEN 系统 SHALL 展示 running / done / error 状态，并展示 provider / model / trace / latency 中可用字段。
4. WHEN 用户复制或替换 AI 结果 THEN 系统 SHALL 提供成功反馈；替换剪贴板必须二次确认。
5. IF provider unavailable、quota exhausted、permission denied 或 model unsupported THEN 系统 SHALL fail-closed 并展示可理解原因。

### FR-2：悬浮助手轻量入口

用户故事：作为经常跨窗口工作的用户，我希望有一个低打扰的悬浮入口，可以在需要时呼出语音/文本面板或截图翻译，而不是常驻占屏。

验收标准：

1. WHEN assistant 或 floatingBall 设置关闭 THEN 系统 SHALL 不创建或保留浮球窗口。
2. WHEN 用户拖动浮球 THEN 系统 SHALL 限制在当前显示器工作区内，并 debounce 保存位置。
3. WHEN 用户点击浮球 THEN 系统 SHALL 打开 VoicePanel 且不抢占无关窗口状态。
4. IF Web Speech 不可用 THEN 系统 SHALL 展示 unsupported；IF 麦克风权限拒绝 THEN 系统 SHALL 停止自动重试、提供系统权限设置入口，并允许用户授权后显式重试语音输入。
5. WHEN VoicePanel 打开 THEN 系统 SHALL 自动聚焦文本框；WHEN 用户按 Enter 且不处于 IME composition THEN 系统 SHALL 单次提交并打开 CoreBox，Shift+Enter 保留换行，重复 Enter 不得并发提交；WHEN 用户按 Escape 且不处于 IME composition THEN 系统 SHALL 单次关闭面板。

### FR-3：基础截图能力

用户故事：作为桌面工具用户，我希望能通过 Tuff 直接截图到剪贴板、临时文件或贴图窗口，以减少依赖外部截图工具。

验收标准：

1. WHEN 用户触发截图命令 THEN 系统 SHALL 支持 cursor-display capture，并返回 width / height / display / duration / output 信息。
2. WHEN 用户选择写入剪贴板 THEN 系统 SHALL 只在 native image 有效时写入剪贴板，并反馈 `wroteClipboard`。
3. WHEN 平台截图能力不可用 THEN 系统 SHALL 展示 unsupported reason，不得伪造成功结果。
4. WHEN 截图输出为 tfile THEN 系统 SHALL 使用临时命名空间与保留期清理，不把截图写入普通业务 JSON。
5. IF 多显示器或 HiDPI THEN 系统 SHALL 使用 DIP 到物理像素映射，避免区域偏移。
6. WHEN 用户选择 region 模式 THEN 系统 SHALL 在目标显示器打开按需 overlay，并把有效拖拽转换为全局 DIP region；Esc、右键、取消、过小选区、超时或窗口销毁不得触发 capture/translate/save。

### FR-4：截图翻译逐步引入

用户故事：作为需要处理外文界面、图片和网页截图的用户，我希望截图后能直接翻译并贴回屏幕，保留原图和译文对照。

验收标准：

1. WHEN 用户选择“翻译剪贴板图片” THEN 系统 SHALL 读取剪贴板图片并调用 image translate scene。
2. WHEN 用户选择“截图并翻译” THEN 系统 SHALL 先执行截图，再把截图图片传入 image translate scene。
3. WHEN 翻译成功 THEN 系统 SHALL 打开 pin window 展示译图，并提供 sourceText / targetText（若 provider 返回）。
4. IF image translate scene 不可用 THEN 系统 MAY fallback 到 OCR -> text.translate，并 SHALL 明确告知用户结果是文本翻译而非图像替换。
5. IF 截图权限、provider、网络或模型不可用 THEN 系统 SHALL 展示对应 degraded reason，并保留截图基础结果。
6. WHEN image translate scene 成功 THEN 系统 SHALL 展示低敏 run ID、总耗时和逐阶段 capability/provider/model/latency；不得暴露 authRef、endpoint 或 provider credential。
7. WHEN pin window 打开 THEN 系统 SHALL 限界在当前 work area，并提供 host-owned 译图/原文/译文复制、关闭、缩放/重置与受支持平台透明度预设；不得使用 raw IPC 或 renderer browser clipboard fallback。

### FR-5：桌面烟花效果

用户故事：作为用户，我希望在完成任务、测试通过或手动庆祝时看到短暂的桌面烟花反馈，让产品更有情绪但不影响工作。

验收标准：

1. WHEN 用户通过命令或 opt-in 成功事件触发烟花 THEN 系统 SHALL 显示透明、短时、可自动销毁的视觉 overlay。
2. WHEN 系统开启 reduce motion、低功耗模式或用户关闭动效 THEN 系统 SHALL 不播放烟花，或降级为静态成功反馈。
3. WHEN 烟花播放 THEN 系统 SHALL 不拦截底层应用输入，除非用户显式进入可交互预览模式。
4. WHEN overlay 超过预设时长或窗口失焦 THEN 系统 SHALL 自动销毁相关窗口、timer 和渲染资源。
5. IF GPU / canvas 不可用 THEN 系统 SHALL fail silently 或展示普通 toast，不影响主流程。

### FR-6：性能与稳定性

用户故事：作为长期运行桌面应用的用户，我希望这些入口常驻时足够轻，不明显增加启动、CPU、内存或输入延迟。

验收标准：

1. WHEN OmniPanel 与 Assistant 均关闭 THEN 系统 SHALL 不启动全局 input hook、不启动语音识别、不创建浮动窗口。
2. WHEN 仅启用浮球 THEN idle CPU SHOULD 接近 0，且拖动更新 SHOULD 控制在 60Hz 内。
3. WHEN 打开 OmniPanel THEN warm window 显示 SHOULD 在 150ms 量级内完成，cold path 需有耗时日志。
4. WHEN 执行截图 THEN 系统 SHALL 记录 capture duration / output size / display meta，日志不得包含图片 base64。
5. WHEN 执行 AI / 翻译 THEN 系统 SHALL 展示 trace / provider / latency 或明确不可用原因。

### FR-7：安全、权限与隐私

用户故事：作为注重隐私的用户，我希望选区、截图和翻译都遵守本地优先和最小权限原则。

验收标准：

1. IF 功能涉及截图、剪贴板、麦克风或 AI provider THEN 系统 SHALL 通过现有 permission / capability / setting gate 控制。
2. WHEN 捕获选区或截图 THEN 系统 SHALL 不把原文、图片、OCR 文本写入普通日志。
3. WHEN 插件接入 OmniPanel 动作 THEN 系统 SHALL 使用 plugin SDK / manifest permission / capability gate，不得绕过权限系统。
4. IF provider secret 或 token 参与调用 THEN 系统 SHALL 只走 secure-store、authRef 或受控 server session。
5. WHEN 用户取消截图、翻译或烟花 THEN 系统 SHALL 及时释放窗口、timer、监听器和临时状态。

## 7. 关键交互流

### 选中文本到 AI 改写

1. 用户在任意应用选中文本。
2. 用户长按快捷键或右键长按打开 OmniPanel。
3. OmniPanel 捕获选区，展示上下文来源和可用动作。
4. 用户选择 AI 改写。
5. 面板内展示结果预览、metadata chips、复制、重试、替换剪贴板。

### 截图到翻译贴图

1. 用户通过悬浮助手或 CoreBox 触发“截图并翻译”。
2. 用户可选择指针显示器、指定显示器或临时区域 overlay；区域取消不产生截图、保存或 AI 调用。
3. 截图结果进入 image translate scene。
4. 成功后打开当前显示器内的 pin window；失败时保留截图并展示原因。
5. 用户可通过右键菜单复制译文、原文或译图，缩放/重置、切换透明度并关闭贴图；也可按 Esc 关闭、按 `Cmd/Ctrl+Shift+C` 快速复制译文、按 `Cmd/Ctrl +/-/0` 调整或重置缩放。

### 手动桌面烟花

1. 用户在 CoreBox 搜索“烟花 / fireworks”。
2. 系统展示短时视觉 overlay。
3. overlay 在预设时长后销毁，不改变系统设置、不写持久状态。

## 8. 性能预算

| 场景                               | 目标                                            | 说明                                                   |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| App idle，Assistant/OmniPanel 关闭 | 不创建相关窗口、不启动 hook / recognition       | 默认关闭是第一性能优化。                               |
| 浮球拖动                           | 渲染更新不超过 60Hz，位置保存 debounce >= 200ms | 现有实现已有 16ms throttle 与 220ms debounce，应保留。 |
| OmniPanel warm open                | P50 <= 150ms，P95 <= 300ms                      | 需要 packaged evidence，冷启动单独标注。               |
| 截图 capture                       | 记录 duration，P95 目标 <= 800ms                | 受平台和屏幕尺寸影响，先做观测再收紧。                 |
| 图片翻译                           | 大图进入 scene 前需尺寸上限或压缩策略           | 防止 base64 巨图造成内存尖峰。                         |
| 烟花 overlay                       | 默认 <= 3s，自动销毁；动效帧率可降级            | 尊重 reduce motion。                                   |

## 9. 风险与缓解

| 风险                             | 影响                   | 缓解                                                                  |
| -------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| 常驻浮窗打扰用户                 | 降低产品接受度         | 默认关闭、设置开关、快速关闭、透明度和位置可控。                      |
| 全局 hook 或语音识别增加资源占用 | 影响长期运行稳定性     | 仅在功能启用时加载；关闭时 cleanup；日志记录生命周期。                |
| 截图权限或平台能力不稳定         | 跨平台体验割裂         | 平台能力统一 unsupported/degraded reason，保留基础失败 UI。           |
| 事件命名混淆                     | 后续维护和插件接入困难 | 先拆 `clipboard-image-translate` 与 `screenshot-translate` contract。 |
| 图片/文本隐私泄漏                | 高风险                 | 禁止 base64 / OCR / prompt 明文日志和 ordinary JSON 存储。            |
| 烟花效果变成主流程依赖           | 偏离生产力主线         | 只作为 opt-in visual feedback，不能阻塞任何任务。                     |

## 10. 验收证据

下一版至少需要以下 evidence：

- OmniPanel 真实选中文本 packaged 截图/录屏：AI translate / rewrite 成功、copy、retry、replace clipboard 二次确认、失败恢复。
- Assistant 浮球 packaged 截图/录屏：默认关闭、启用后显示、拖动持久化、VoicePanel 打开、文本发送 CoreBox。
- 截图 packaged evidence：cursor-display capture、region capture、write clipboard、tfile 输出、多显示器/HiDPI 至少一组。
- 截图翻译 packaged evidence：clipboard image translate、screenshot translate、pin window 展示与 copy/close/zoom/opacity、provider unavailable 失败态。
- 性能 evidence：idle、open OmniPanel、drag floating ball、capture screenshot、translate image 的耗时摘要。
- 安全 evidence：日志中无截图 base64、OCR 原文、provider secret、token、完整 prompt/response。

## 11. 参考资料

- Raycast AI Commands Manual: https://manual.raycast.com/ai/ai-commands
- PopClip Guide: https://www.popclip.app/guide/
- Microsoft PowerToys Text Extractor: https://learn.microsoft.com/en-us/windows/powertoys/text-extractor
- Microsoft PowerToys Advanced Paste: https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste
- Snipaste: https://www.snipaste.com/
- Apple Live Text in Preview on Mac: https://support.apple.com/guide/preview/interact-with-text-in-a-photo-prvw625a5b2c/mac
- Apple Translate text on Mac: https://support.apple.com/guide/mac-help/translate-text-on-mac-mchldd8b3c15/mac
