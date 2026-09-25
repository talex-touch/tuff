# Composer 动效：托盘换位 / 墨色悬停 / 芯片模糊变身

## Goal

把 @flohoeller「Chatbox component」视频里的三段交互动效搬进 TuffEx 的 AI 对话输入组件，让 AI 套件的输入框在"上下文托盘切换、工具栏悬停、状态芯片切换"三个时刻有同等质感。

## Background

- 参考（老板 2026-09-23 指定）：
  - 视频 https://x.com/flohoeller/status/2102660458658582913
  - 静态稿 https://x.com/flohoeller/status/2100478630375628922
  - 逐帧实测数据（时长、曲线、各阶段编排）只存在 `research/reference-motion.md`，本文件不重复数字。
- 起因：老板在 AI 套件画廊 Chat 格看到灰色光斑和紫点，以为那是流式动效。实际两者都不是：
  - 光斑是 `TuffexDocsHeroBackground.vue:195-215` 的 `.dark` 全局泄漏，talex-touch-87 已认领修复；
  - 紫点是 Lexi 浏览器扩展加的标记。
- 现状：
  - `TxChatComposer`（`packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue`）是带边框的卡片里再套一个带边框的 textarea，发送按钮是描边样式，placeholder 在画廊里是等宽字体（textarea 没有继承字体）。
  - `TxChatComposer` 和 `TxPromptBar` 都没有托盘结构，也没有状态芯片。
  - 下游 `packages/intelligence-uikit/src/components/conversation/TxAiComposer.vue` 包了 `TxChatComposer` 并透传全部插槽；它在 `intelligence-uikit/src/style/index.scss:172-291` 用 `.tx-ai-composer` 把根元素当卡片来画，还给 textarea 重新加了边框。
  - `TxAiComposer` 被 Nexus dashboard 的 `IntelligenceAgentWorkspace.vue` 使用。

## Decisions

- D1 载体是 `TxChatComposer`，并把外观改成参考稿的样子。默认外观会变，`TxAiComposer` 和 dashboard 跟着换新。`TxPromptBar` 不动。
- D2 状态芯片做成独立可复用组件（定名见 D4）。
  - 原生 `<button>`，props 为 `icon / label / tone`，tone 复用 `StatusTone`；
  - 文字复用 `TxTextTransformer` 的模糊交叉；
  - `TxStatusBadge` 不动。
- D3 悬停遵守设计规范：颜色立即切换，只搬参考里"只变墨色、不加底板"的视觉，不照搬视频的 120ms 渐变。
- D4（2026-09-24，老板回复 start 即同意）新组件定名为 `TxModeChip`，目录 `mode-chip/`。理由：`*-state` 在本库是整页状态组件家族（EmptyState、ErrorState 等），叫 `TxStateChip` 会被当成其中一员。
- D5（2026-09-24，同上）发送按钮改成圆形向上箭头的图标按钮，`sendButtonText` 作为可访问名。

## Requirements

- R1 托盘换位（`TxChatComposer`）
  - 可选的 `tray` 插槽加 `trayPlacement: 'top' | 'bottom'`（默认 `'bottom'`）。
  - 切换位置时按参考编排：旧内容淡出并轻微模糊 → 卡片滑动一个托盘行高、不回弹 → 新内容由卡片让出，不做淡入。
  - 托盘等高时外框尺寸不变。托盘的出现和消失也要平滑。
- R2 外观（D1）
  - 输入框去边框、继承字体，高度在 minRows 和 maxRows 之间自适应；
  - 卡片用 ring 加一级阴影，托盘用平涂灰底；
  - 附件和发送改成图标按钮，可访问名沿用现有的文字 props。
  - 所有 props、事件、插槽和内部 class 名保持兼容。
- R3 悬停（D3）：工具栏和托盘里的次级按钮悬停时，墨色立即变为主色，没有底色块，也没有颜色过渡。
  - 文字类动作（托盘文字、muted 芯片）静止时用 `--tx-text-color-regular`。次级色在白底上只有 3.08:1、在托盘底上只有 2.87:1，13px 文字不达标。
  - 纯图标按钮（`+` 附件）静止时仍用次级色，图形只需 3:1。
- R4 状态芯片（D2）
  - 切换 label、icon 或 tone 时：图标缩放互换并略早于文字，文字模糊交叉，底色和墨色只在变身期间过渡，宽度平滑跟随。
  - 每个 tone 的墨色对底色的对比度实测后写进源码注释，不低于 4.5:1。
- R5 reduced-motion：三段动效在 `prefers-reduced-motion: reduce` 下都直接落到终态、不跳布局。`TxTextTransformer` 的 fade 模式补上缺失的 reduced-motion 退路。
- R6 下游与文档
  - `TxAiComposer` 的样式迁移到新结构；
  - 按 `tuffex-docs-sync` 同步 Nexus：`chat-composer` 文档和 demo、新组件的文档对、demo、注册、侧栏、画廊，`text-transformer` 文档加一条说明，以及所有提到这些组件的文档；
  - 按注册链登记新组件（components.ts、ai barrel、README 计数）。

## Acceptance Criteria

- [x] R1/R4：在 ego 里逐帧取样。
  - 托盘换位：在参考的五个取样点上，进度偏差最大 −0.08；约 520ms 停稳（参考约 510ms）；无回弹；新托盘全程不透明度为 1；外框高度恒定。
  - 芯片变身：dev server 重启后取样，图标领先；文字在 59ms 切换；旧文字约 75ms 消失（参考约 80ms）；新文字约 266ms 变清晰（参考约 280ms）；总长约 330ms（参考约 370ms）。
  - 采样数据：`/tmp/composer-motion-drafts/trace-*.json`。
- [x] R2：亮色和暗色下，`chat-composer`、`mode-chip` 文档页、画廊两格、intelligence-uikit playground 都正确，placeholder 已不是等宽字体。
  - 未验证：Nexus dashboard 工作台需要登录，未实测；`TxAiComposer` 在 playground 里验过。
- [x] R3：静止时 `.tx-chat-composer__attach` 和 `__send` 的计算样式是 `transform 0.12s`，芯片是 `all 0s`；由 `chat-composer-style.test.ts` 和 `mode-chip-motion.test.ts` 守住。
- [x] R4：对比度实测表写在 `TxModeChip.vue` 注释里，最差 4.58；有测试覆盖 tone、图标 keyed 互换、50ms 文字延迟、`.is-morphing` 生命周期。
- [x] R5：用 CDP 模拟 reduced-motion 后，芯片和托盘都在 2 帧内落到终态，且没有任何 running animation。
- [x] R6：
  - Nexus 门禁（demo-registry、mdc-fences、doc-parity、icon-collections、recategorize）全部通过；全量 vitest 260 个文件、1926 个用例通过；中英页面都渲染出新章节。
  - uikit 的 vitest 为 2 个文件、6 个用例，typecheck 为 0 错误。
- [x] 通用：
  - tuffex 全量 vitest 249 个文件、2655 个用例；vue-tsc 0 错误；各包 eslint 通过。
  - core-app 用 web 端 vue-tsc 直接编译 tuffex 源码，0 错误。
  - tuffex 发布审计（exports、readme、types、size、cursor）全部通过；`git diff --check` 通过。
  - 另在只检出 HEAD 的隔离 worktree 里复验了门禁、文档覆盖测试（4/4）和 tuffex 相关目录（16 个文件、111 个用例）。
  - 控制台只有 Lexi 扩展引起的 hydration 警告，以及早就存在的 intlify 缺 key，不是本任务引入的。

提交：
- `e43fa1190` fix(tuffex)：TxTextTransformer 的 fade 淡入修复，加上 reduced-motion 退路。
- `0e5b9e33f` feat(tuffex)：新增 TxModeChip。
- `55bbc5039` fix(nexus)：纠正 `0e5b9e33f` 中三处共用文件条目的位置。当时用零上下文补丁只取部分改动块暂存，位置错了。
- `a23b7266e` feat(tuffex)：ChatComposer 的托盘换位和新外观。
- `558d6ce82` docs(spec)：规范更新。

## Out of Scope

- `TxStreamMarkdown` 的显影参数和光标对齐 BUI。
- `.dark` 全局泄漏（talex-touch-87 负责），以及 `UpdatesAllView.vue:443` 的同类写法。
- Lexi 扩展标记。
- `TxPromptBar`、`TxStatusBadge` 的任何改动。

## Notes

- 实施顺序、验证命令和回滚点见 `implement.md`；技术设计见 `design.md`。
- ego TaskSpace 7 已为本任务开启，实现阶段复用，收尾时 `finish({ keep: [] })` 一次。
- 共享工作树的规则（锁、协调、不 commit）写在 `implement.md` 开头。
