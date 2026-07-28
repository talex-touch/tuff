# 三插件现状审计（首轮）

## 范围与结论

目标目录已确认：

- Translation：`plugins/touch-translation`
- Intelligence：`plugins/touch-intelligence`
- Clipboard：`plugins/clipboard-history`

三个插件均已有可运行主路径和自动化测试。本轮不是从零建设，也没有基线测试失败；后续应以用户体验、边界可靠性和可维护性为主，并在复现或测试证明后再认定具体缺陷。

## Translation

### 已有能力

- Manifest 暴露普通翻译、多源翻译、实验性截图翻译三条入口，见 `plugins/touch-translation/manifest.json:64`。
- CoreBox 运行时具备请求序列、debounce、AbortController 和按 feature 隔离的 widget 状态，见 `plugins/touch-translation/index/main.ts:84`。
- Widget 支持多 Provider 结果、历史、发音、释义、复制和错误展示，见 `plugins/touch-translation/widgets/translate-panel.vue:1`。
- 同时保留独立页面与 Provider 配置 UI，入口位于 `plugins/touch-translation/src/pages/`。

### 风险与待验证点

- 宿主运行时约 925 行，主 widget 约 1718 行；状态规范化、历史、音频、Provider 展示和动作处理集中在单文件，增加局部修改回归风险。
- CoreBox widget 与独立多源页面形成两套体验形态，需要确认首轮优化的主路径，避免同时铺开。
- 网络权限和 AI 权限存在进程级成功缓存，见 `plugins/touch-translation/index/main.ts:91`；需要验证运行中撤权后的行为。

### 基线

- `pnpm --filter @talex-touch/touch-translation-plugin exec vitest run`
- 5 个测试文件、19 个测试全部通过。

## Intelligence

### 已有能力

- 支持智能问答、OCR、上下文续问、流式输出、取消、重试、复制、替换选中文本、Provider/Model 选择和错误恢复。
- 具备改写、摘要、解释及本地自定义 AI 命令注册表，见 `plugins/touch-intelligence/README.md:1` 和 `plugins/touch-intelligence/manifest.json:56`。
- 运行时限制历史消息数并管理会话与活动流，见 `plugins/touch-intelligence/index.js:84`、`plugins/touch-intelligence/index.js:250`。

### 风险与待验证点

- `index.js` 约 3758 行，混合能力调用、流生命周期、会话、持久化、动态 feature、命令注册和 widget item 构建；维护与局部验证成本高。
- `ask-panel.vue` 约 1722 行，`command-registry.vue` 约 1143 行；展示、动作、错误恢复与选择器状态高度集中。
- 插件 `package.json` 只有 build/publish 脚本，没有直接 test/typecheck 脚本，虽然仓库级 `packages/test/src/plugins/intelligence.test.ts` 已覆盖大量运行时行为。

### 基线

- `pnpm exec vitest run packages/test/src/plugins/intelligence.test.ts`
- 1 个测试文件、68 个测试全部通过。

## Clipboard

### 已有能力

- 提供全部、文本、图片、文件、收藏筛选，分页加载、详情预览、复制、粘贴应用、收藏、删除和键盘导航。
- 每页 50 条并通过 SDK 获取历史；历史变化时重载第一页，见 `plugins/clipboard-history/src/views/ClipboardManagerView.vue:24`、`:223`、`:394`。
- 图片原图按选择延迟解析并回退缩略图，见 `plugins/clipboard-history/src/views/ClipboardManagerView.vue:133`。

### 风险与待验证点

- 主视图约 771 行，数据加载、选择状态、动作状态、图片解析和键盘事件集中在一个组件。
- 历史变化会直接重载当前筛选的第一页；需要验证高频写入时是否造成选择跳变、重复请求或视觉闪烁。
- `handleCopy` 只在 `finally` 恢复 pending，没有本地错误映射，见 `plugins/clipboard-history/src/views/ClipboardManagerView.vue:270`；需确认 SDK/宿主是否已统一展示错误。

### 基线

- `pnpm --filter @talex-touch/clipboard-history-plugin test`
- 3 个测试文件、20 个测试全部通过。

## 下一步

1. 由用户确定首轮优化策略与优先级。
2. 针对选定主路径做交互走查和问题复现。
3. 将已验证问题、MVP 范围和验收标准分别写入三个子任务。
4. 复杂子任务补齐 `design.md`、`implement.md` 后再申请进入实现。
