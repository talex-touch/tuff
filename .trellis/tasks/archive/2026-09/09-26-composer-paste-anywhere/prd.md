# 主页输入框：焦点不在输入框时也能粘贴图片

父任务：`09-25-home-session-polish`。2026-09-26 老板反馈「好像输入框没办法粘贴图片」（复制的是截图 / 图片内容，当时没有在回复）。

## 结论（CDP 实测）

- 焦点在输入框里时，真实粘贴（系统剪贴板里的截图）会触发 `paste`，`clipboardData.items` 有一项 `file:image/png`，附件区出现缩略图 —— 输入框自己的处理没问题。
- ⌘V 在焦点不在输入框时（点过发送 / 附件 / 模型按钮之后，点过对话区或空白处之后）不会到达 textarea 的 `@paste`，而页面上别处没有任何粘贴处理 → 什么都不发生。
- 另外 `addFiles` 与拖入在回复流式输出期间直接忽略附件（打字却可以），同属「粘不上图」。

## 做了什么（`HomePage.vue`）

- `pastedFiles(event)` 抽出；`onPaste`（textarea）不变。
- `window` 上的 `paste` 兜底 `onPagePaste`：仅在 Home 路由、事件未被处理、目标不在其他可编辑元素（input / textarea / contenteditable）时，把粘贴的文件放进附件区并聚焦输入框；焦点外粘贴的纯文本仍忽略。卸载时移除监听。
- 回复流式输出期间也能粘贴 / 拖入附件（发送仍由 `canSend` 等回复结束）。

## 验证

- CDP 真实粘贴（`Input.dispatchKeyEvent` + `commands: ['paste']`，用老板剪贴板里原有的截图，未改动剪贴板）：焦点在「+」按钮上、焦点在 body 上两种情况，附件区都出现 1 张缩略图，焦点回到输入框；测试附件已删除。
- core-app `vue-tsc -p tsconfig.web.json`、eslint 通过。
