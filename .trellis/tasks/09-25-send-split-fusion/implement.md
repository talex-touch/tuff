# 实施计划：发送分裂动画

## 前置

- 依赖 `09-25-tuffex-fusion-surface` 完成（`fusionSurfacePath` 的 `includeBody: false` / `spans`、`spring.ts` 的 `springSteps` 已在 tuffex dist 里）。
- 读规范：`.trellis/spec/frontend/component-guidelines.md`、`hook-guidelines.md`、`quality-guidelines.md`；读 `08-09-send-flight-layering/prd.md` 的层级约定。

## 步骤

1. **CDP 环境**（整个父任务只做一次，老板已同意；如果前面的子任务已经启动过带调试端口的 dev，跳过本步只复用）
   - `ListAgents` 确认没有其他会话依赖当前 dev 进程；优雅停掉现有 `pnpm core:dev` 进程树（SIGTERM 给 electron-vite，确认 Electron 退出、`database.db` 无第二个写者）。
   - 后台重启：`pnpm core:dev --remoteDebuggingPort 9333 > /tmp/tuff-core-dev.log 2>&1 &`（参数经 dev-electron-wrapper → `electron-vite dev --remoteDebuggingPort`，由 electron-vite 转成 Electron 的 `--remote-debugging-port`）。
   - `/tmp/tuff-cdp/` 放一个不进仓库的 Node 小工具（Node 26 内置 WebSocket）：列 target、在主窗口页面 `Runtime.evaluate`、`Input.insertText` + 回车发送、`Tracing` 录性能、`Page.startScreencast` 存帧、`Page.captureScreenshot`。
2. **基线**：空态第一次发送、停靠后发送各录 3 次性能轨迹 + screencast；长任务、丢帧、热点函数写入 `research/perf-baseline.md`。
3. **`TxConversationStream` 减负**（tuffex）：`range` 起止不变时返回旧对象；单测断言连续小幅滚动不触发插槽重渲染；`conversation-stream.{zh,en}.mdc` 的 `## 技术实现` 补一行；构建 tuffex dist（带 `/tmp/tuffex-build.lock`）。复测基线，记录收益。
4. **score**：`composables/send-split/score.ts`——阶段时长、紧凑尺寸、材质插值、落点预测的纯函数 + 单测。
5. **split driver**：`composables/send-split/split-driver.ts`——弹簧推进、调用 `fusionSurfacePath`、断开判定与小尖回缩、三次落点读取与改道、落地揭开；单测用假时钟 / 假 rAF 覆盖：阶段顺序、断开只触发一次、改道时位置与速度连续、新的一次发送让旧动画立刻落位、卸载清理、减少动态效果直接返回。
6. **编排**：`useSendChoreography.ts` 用 `playSplit` 替换 `playSend`，`playComposerFlip` 支持 `delay`；`HomePage.vue`：覆盖层模板、`.is-splitting`、草稿幽灵、输入框高度锁与解锁过渡、`--home-z-seam`；`submit()` 按 design §1 的顺序调用。更新 `useSendChoreography.test.ts`。
7. **调参与验证**：CDP screencast 逐帧看形状与时序，按录帧调 score 常量；复测性能，未达标则执行 design §4.3 的决策点。
8. **收尾**：清理测试产生的对话（历史里删除），停止 screencast / tracing，dev 进程保持带调试端口运行直到父任务集成走查结束，再问老板是否恢复原来的启动方式。

## 测试发送的成本

2026-09-25 老板确认：测试发送全部走真实提供方（每次一轮很短的问答）。测试消息用简短、不需要长回复的内容；测试产生的对话走查结束后从历史里删除。

## 验证命令

```bash
cd apps/core-app
pnpm exec vitest run \
  src/renderer/src/composables/useSendChoreography.test.ts \
  src/renderer/src/composables/send-split
# 不跑 typecheck:web —— 它会先重建 tuffex dist，打断 nexus dev（tuffex-docs-sync.md）
npx vue-tsc --noEmit -p tsconfig.web.json --composite false
npx eslint --quiet src/renderer/src/composables src/renderer/src/views/base/home/HomePage.vue   # 包内跑，不在仓库根
npx prettier --check src/renderer/src/composables src/renderer/src/views/base/home/HomePage.vue
cd ../../packages/tuffex && pnpm exec vitest run packages/components/src/conversation-stream
git diff --check
```

- 性能：`/tmp/tuff-cdp` 录制前后对比表，贴进 `research/perf-after.md`。
- 视觉：screencast 帧拼成联系表（`magick montage`），亮 / 暗主题各一份；替身换真实行那一帧前后，在页面里逐帧采样气泡矩形，确认误差 ≤ 0.5px。

## 风险与回滚点

- 最大风险是覆盖层与输入框接缝不齐（描边颜色、聚焦光环、会话态毛玻璃）：`.is-splitting` 统一接缝处的颜色；若玻璃态差异肉眼可见，把会话态的颈部填充改为读输入框的计算背景色。
- 回滚点：步骤 3（纯性能修复）可以独立保留；步骤 6 之前的 `playSend` 原样保留到新实现通过验证后再删，出问题时切回只需恢复 `submit()` 里的一行调用。
- dev 进程重启会中断老板当前的 dev 会话一次：只在步骤 1 做一次，之后全程 HMR。
