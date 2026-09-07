# 剪贴板历史：密钥掩码一致性与交互修复

## Goal

`plugins/clipboard-history` 的密钥展示目前只在洞察区做了掩码，其余三个表面仍然渲染完整明文，掩码是装饰而不是保护。同时窗口整体可被拖拽全选、分类条只能用鼠标点、图片主题色带被挤到需要滚动、Cmd/Ctrl+Enter 对所有内容类型都只是"复制"。

本任务把这五项一次修完：让掩码在所有表面成立，让键盘和布局达到一个启动器该有的水平。

## 背景事实（已核对源码，不是推测）

- 洞察区「值」用 `detectSecret().masked`（`clipboard-shapes.ts:107 maskSecret`）掩码。
- 但同一条记录的完整明文同时出现在三处：
  - `ClipboardSidebar.vue:86` 列表标题 → `getClipboardTitle()`（`clipboard-items.ts:524`，直接返回 `item.content` 截断到 72 字符，51 字符的 key 一个字都不截）。
  - `ClipboardDetail.vue:219` 预览区 → `<pre>{{ item.content }}</pre>`，完整明文。
  - `ClipboardMoreInfo.vue:151` 「字符拆分」→ 把 51 个字符逐个渲染成可点按钮，等于把 key 拼图式完整泄漏；`summary` 里还主动宣传了这一节的存在。
- 插件 Surface 的 `window.open` 被主进程 `plugin-window-policy.ts:572` 的 `setWindowOpenHandler(() => ({ action: 'deny' }))` 拒绝，所以 `ClipboardManagerView.vue:372 handleOpenLink` **必然**落进降级分支，链接从来没被真正打开过。
- `ClipboardDetail.vue:251` 的文件眼睛按钮 emit `previewFile`，但 `ClipboardManagerView.vue:564` 挂载 `ClipboardDetail` 时没有监听它 —— 该按钮点了没有任何效果。
- `AppEvents.system.openExternal` / `AppEvents.system.showInFolder` 在主进程用 `transport.on` 注册，插件通道同样可达（`system-shell-handlers.ts:99` 的注释明确记录了这一点），且 `openExternal` 走 `validateExternalUrl` 校验。这是 Surface 侧打开链接/定位文件的现成受控入口。

## Requirements

### R1 密钥掩码在所有表面一致

- 被 `detectSecret()` 判定为密钥的记录，其完整值默认不得出现在任何表面：列表标题、预览区、更多信息、DOM 属性（`title` / `alt`）。
- 提供**唯一一个**显示/隐藏开关，位于详情预览区；开启后预览区与洞察区「值」同步显示明文，切换记录时自动复位为隐藏。
- 列表标题永远掩码，不受开关影响 —— 列表是旁人一眼扫到的表面。
- `kind === 'private-key'` 的记录不提供显示开关，正文一个字符都不进 DOM（沿用现有约定）。
- 「字符拆分」对密钥记录整节不渲染，`更多信息` 的 summary 也不得列出它。这一节对密钥没有任何使用价值，只有泄漏面。
- 复制 / 粘贴写入的仍然是完整值，行为不变；现有提示文案「默认掩码；复制时写入的是完整值」继续成立。

### R2 全局 user-select

- 整个插件界面默认不可选中（拖拽不再全选）。
- 只有真正的内容正文可选：预览区文本、OCR 文本、输入类元素。
- 密钥记录在未开启显示开关时，预览区选中拿到的只能是掩码串。

### R3 Cmd/Ctrl + ←/→ 切换分类

- 在分类条上循环切换（到头回绕），跳过 `ready === false` 的项。
- 与既有 ArrowUp/Down（无修饰键，移动选中项）互不干扰；焦点在输入类元素时不接管。
- footer 快捷键提示补上这一条。

### R4 图片主题色带不再挤出滚动条

- 图片记录的预览区在默认尺寸下不出现滚动条。
- 主题色带改为竖排在图片一侧，色带与说明文案不再占用图片的垂直空间。
- 无主题色时整条不渲染（现有行为保持）。

### R5 Enter 语义按内容类型分派

- `Enter` = 粘贴到当前应用（不变）。
- `Cmd/Ctrl + Enter` 从"永远复制"改为**按内容类型的默认动作**：
  - 链接 → 系统默认浏览器打开（经 `system.openExternal`，受 `validateExternalUrl` 约束）
  - 图片 → 应用内大图浮层（Esc 关闭）
  - 文件 → 在 Finder / 资源管理器中定位（经 `system.showInFolder`）；多文件时定位第一个
  - 其他（含密钥、命令、颜色、纯文本）→ 复制
- footer 右侧按钮的文案跟随当前选中项类型变化，不能出现"按钮写着复制、实际打开浏览器"。
- 顺带把 `ClipboardDetail` 的 `previewFile` 接线到同一套动作上，让文件行的眼睛按钮真正生效。
- 本任务**不**新增"用系统默认应用打开任意文件"的宿主能力 —— 那等于让插件拉起任意文件关联程序，不在本次范围内。

## Acceptance Criteria

- [x] AC1 一条 OpenAI key（`sk-` + 48 位）记录下，列表标题、`title` 属性、预览区、更多信息四处均无完整值；单测断言渲染后的 DOM 文本不包含原始 key。
- [x] AC2 打开预览区显示开关后预览区与洞察区同时出现完整值；切到另一条记录再切回来，开关已复位为隐藏。
- [x] AC3 私钥记录没有显示开关，且 DOM 里不含 `-----BEGIN` 之后的任何正文片段。
- [x] AC4 密钥记录的「更多信息」摘要不含"字符拆分"，展开后也没有字符网格。
- [x] AC5 在非输入区域按下鼠标横跨整个窗口拖动，不产生跨区域选区；预览区内部仍可正常选中文本。（纯 CSS，无测试；见下方"未验证"）
- [x] AC6 Cmd/Ctrl + ←/→ 在分类条上循环切换，并触发对应的历史查询；焦点在输入框时不触发。
- [x] AC7 图片记录在默认窗口尺寸下预览区无滚动条，主题色带竖排显示在图片一侧。（版式改动，见下方"未验证"）
- [x] AC8 链接记录按 Cmd/Ctrl+Enter 调用 `system.openExternal`（单测断言 SDK 收到该调用与 URL），不再走 `window.open`。
- [x] AC9 文件记录按 Cmd/Ctrl+Enter 调用 `system.showInFolder` 并带上第一个文件路径；文件行的眼睛按钮走同一条路径且带该行自己的路径。
- [x] AC10 图片记录按 Cmd/Ctrl+Enter 打开大图浮层，Esc 关闭；浮层打开期间上下键不再改选中项。
- [x] AC11 文本/密钥记录按 Cmd/Ctrl+Enter 仍是复制，footer 按钮文案与实际动作一致。
- [x] AC12 `clipboard-history` 的 test（121 passed）与 typecheck 全绿；`packages/utils` 的 `plugin-facing-events` 派生测试与 `core-app` 的 `src/main/channel/` 全套（88 passed）全绿。

### 未验证（需真实窗口人工确认）

AC5 与 AC7 是纯样式改动，没有自动化覆盖。`user-select` 与图片预览区的定高布局都要在真实窗口里拖一次、放一张长图和一张宽图才算数。其余 AC 均有单测，且"不包含"类断言与权限门都跑过反向对照。

### 范围变更

PRD 原本写明"不新增宿主能力"。规划时我误判 `system.openExternal` / `showInFolder` 从插件 Surface 已可达（依据是 `system-shell-handlers.ts` 里一条写于 #688 之前的过时注释），实际两者都不在插件通道白名单里。用户裁定放宽白名单并补上 `system.shell` 权限门，因此这条非目标作废，改动扩展到 `packages/utils` 与 `apps/core-app`。

## 非目标

- 不改主进程的剪贴板采集、分类器（C2）或数据库结构。
- 不新增"用系统默认应用打开任意文件"的能力。
- 不做密钥的加密落库 —— 本任务只解决**展示面**的掩码一致性；存储侧加密是独立议题。

## Notes

- 不拆子任务：五项都落在同一个插件的同一批文件（`ClipboardManagerView.vue` / `ClipboardDetail.vue` 两个文件被其中四项同时触及），拆开会制造文件争用，收益为负。改成 `implement.md` 里的有序里程碑，每个里程碑单独可验证、单独可提交。
