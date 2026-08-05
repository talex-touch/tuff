# 执行计划 · 首页对话 R1

对应 `prd.md` 的 R1 与 `design.md`。改动面：renderer 两个新文件 + `HomePage.vue` + 两份 i18n。不改主进程、不改路由、不加迁移。

## 步骤

### S1 组合式函数

新建 `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts`：

- 导出 `ConversationMessage` 类型与 `useHomeConversation()`
- `send(text)`：入列 user 消息 + `streaming` 助手占位 → `sdk.stream('text.chat', { messages })` → `onDelta` 追加 / `onEnd` 收尾 / `onError` 转 `failed`
- 流式抛错且零增量时兜底 `sdk.text.chat`
- `stop()`：`controller.cancel()`，当前助手消息转 `complete`
- 传给 provider 的 `messages` 过滤掉 `streaming` 与 `failed`（design.md §2 不变量 3）
- SDK 通过参数注入（默认 `useIntelligenceSdk()`），便于单测替身

**验证**：`npx vitest run src/renderer/src/modules/conversation`

### S2 单测

`useHomeConversation.test.ts` 覆盖：增量累积、`stop()` 保留已产出内容、`onError` 落错误态、流式抛错零增量时走 `text.chat` 兜底、有增量后抛错不兜底、`streaming` 中拒绝二次 `send()`。

### S3 视图接入

`HomePage.vue`：

- 引入组合式函数，发送键绑 `send()` / 流式中绑 `stop()`，`Enter` 发送、`Shift+Enter` 换行
- 消息态渲染消息流（design.md §4 版式），composer 提到 `HomePage` 直接子级并保持**同一 DOM 节点**（§3）
- 助手消息等待首个增量时给三点脉冲；`failed` 消息给可读文案 + 重试入口
- 只用 `--shell-*` token，不写十六进制

**Review gate**：空态尺寸（logo 64 / Center gap 30 / ComposerGroup gap 18 / Composer 720）与改动前逐项一致，本轮不得偏移。

### S4 i18n

`zh-CN.json` / `en-US.json` 的 `home` 下补：`stop`、`retry`、`thinking`、`error.noProvider`、`error.generic`。两份键集必须等同。

### S5 收口

**验证**：
```
cd apps/core-app && npm run typecheck
npx vitest run src/renderer/src/modules/conversation
pnpm lint
```
外加实机：`pnpm core:dev` 跑一次发送 → 流式 → 停止 → 未配置 provider 的错误态，light / dark 各验一次。

## 执行记录（R1）

| 步骤 | 状态 | 落点 |
|---|---|---|
| S1 | 完成 | `modules/conversation/useHomeConversation.ts`、`conversation-error-display.ts` |
| S2 | 完成 | `useHomeConversation.test.ts`，11 例全绿 |
| S3 | 完成 | `views/base/home/HomePage.vue` |
| S4 | 完成 | `lang/zh-CN.json`、`lang/en-US.json` 各 +5 键（`stop` / `retry` / `thinking` / `error.*`） |
| S5 | 部分 | 静态检查通过；实机验证与双主题待用户跑 `pnpm core:dev` |

`error-display` 的存在理由：主进程 `toNormalizedIntelligenceError` 把错误码编进 `[CODE:capabilityId] message` 前缀，而流式 transport 过 IPC 时只保留 message 字符串（`client-runtime` 重建 `new Error(data.error)`，丢掉 `code` / `reason` / `recovery`）。前缀因此是渲染层唯一的分类信号，解析放在纯函数里而不是组合式函数内。

验证结果：
- `npx vitest run src/renderer/src/modules/conversation` → 11 passed
- `npx vue-tsc --noEmit -p tsconfig.web.json` → 本轮改动零报错
- `npx eslint <本轮四个文件>` → 零报错

与本轮无关的既有失败（未修，不属本轮范围）：
- `components/render/AskPanelRetry.test.ts` TS6307：该测试从 `plugins/touch-intelligence/widgets/ask-panel.vue` 跨包 import，不在 `tsconfig.web.json` 的 include 内。HEAD 提交 `0df7648a7` 即如此。
- `views/layout/AppShell.vue` 一度报 `ShellWindowControls` / `isMac` 未使用，重跑即消失 —— 并发写入该文件的中间态，非本轮引入。

## 回滚点

每步独立可回滚。S3 是唯一触碰既有文件的步骤，回滚只需还原 `HomePage.vue`；S1/S2/S4 均为新增或纯追加。

## S6 画板对齐（待执行）

对话态画板已补齐（`lbZ9a` / `Jqm2L` / `cJ3N6`，见 design.md §4）。代码先于画板落地，需回补三处，清单见 **design.md §4.1**：

- [x] `shell-tokens.scss` 补 danger 系 token（`:root` / `.dark` / `html.contrast` / `html.dark.contrast` 四块；高对比下 `--shell-danger-border` 直接取 `--tx-color-danger`，24% alpha 发丝线在高对比下等于没有）
- [x] `HomePage.vue` 错误块换成 `danger-soft` 版，重试按钮描边换 `$danger-border`，并补 `role="alert"`
- [x] 发送键禁用态由 `opacity .4` 改为 `$surface-2` + `$text-muted` 箭头（子任务 ① 遗留偏差）
- [x] 等待态三点改用 TuffEx `TxTypingIndicator`（`variant="dots"`，尺寸 6/5 与画板一致），删掉本地 keyframes

**验证**：`typecheck:web` 本轮零报错；`vitest src/renderer/src/modules/conversation` 11 passed；eslint 零报错。light / dark / 高对比三种模式的错误块对比度待实机看。

### TuffEx 侧改动

`TxTypingIndicator` 的 dots 是唯一不走 `currentColor` 的 loader 变体（其余 4 个都走），宿主换不了色。改为 `currentColor` 并新增 `--tx-typing-indicator-color` 钩子，默认值不变（根节点的 color 仍解析到同一个变量）。zh/en 文档各补一节 `### CSS Variables`。纯 CSS 改动，jsdom 测不到计算样式，未加测试；`packages/tuffex` chat 三个测试文件 20 passed，dist 已重建。

## 已知偏离

- 无。对话态版式已有画板实测值；剩余差异全部登记在 S6。
