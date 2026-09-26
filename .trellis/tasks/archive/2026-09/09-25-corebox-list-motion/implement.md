# Implement — CoreBox 列表与 item 过渡动效

分阶段串行推进（大部分改动都在 `CoreBox.vue` / `useSearch.ts`，不并行派发）。每个阶段结束都跑一遍验证、保持树可用，再进下一阶段。

## Phases

1. [x] **阶段 1（不依赖其他任务）**
   - R-E：统一门控，包括 CoreBox 挂上低电量开关和抽出 `shouldAnimate()`；
   - R-A：预览面板迟滞；
   - R-C：推荐路径不预先清空。
2. [x] **阶段 2（等 keyboard-jump 检查通过）**：R-B 同查询刷新对账，并改写 07-15 中间态用例。
3. [~] **阶段 3**：
   - R-D8 跟随高亮块（含 hover 处理）；
   - R-G 列表 FLIP 位移，先默认关、挂在开关下；
   - 帧率测量：CDP Performance，事先与共享 dev 实例的会话协调；达标再改成默认开启，数据写进 `research/perf.md`。
4. [ ] **阶段 4**：R-F 预览卡片（稳定 key + 描边改成合成器实现）；R-P2（历史面板、高度测量、预览占位）。

## 进度（2026-09-26）

- **阶段 1–2 已检查**（trellis-check）。修掉 5 个问题：
  - 清空或细化查询时，预览面板会打开旧结果里的文件：新增 `rowsQuery`，loading 期间冻结面板；
  - 超过 80 条上限时，对账会误删重新下发的行：改为按截断前的 `deliveredIds` 对账；
  - 对账会把别处已替换的列表写回来：加了守卫；
  - 兜底超时从 3000 改为 3500ms；
  - 同名区分改成逐层分组，每次约 0.1ms。
- **阶段 3 已实现并接线**：
  - 新文件：`useSelectionBlock.ts`、`useListFlip.ts`、`CoreBoxSelectionBlock.vue`，各带单测，18 个变异；
  - 接线补丁已应用到 `CoreBox.vue` / `BoxItem.vue`；
  - 41 个文件、350 个用例通过；vue-tsc、eslint 通过。
- **真机（CDP 9333）**：
  - 块与选中行逐步重合；行底色透明、强调条随块；`data-pointer-idle` 生效；深色下块底色 `rgb(20,20,20)`。
  - 单步滑动：120Hz 屏上约 82ms，ease-out、不回弹，块与强调条一体移动。
  - 按住 ↓ 不拖尾，已验证（第二轮录屏，69 行列表）：
    - 约 41ms 连发时，第一步之后块与选中行逐帧偏差为 0（瞬移跟随）；
    - 约 91ms 连发时，每步都滑动，并在下一步之前回到偏差 0，最大偏差一行（52px）；
    - 单步约 58ms 收敛到 0.5px 以内。
  - 帧率：120Hz 下平均 8.6ms / 帧，4.2s 内有 5 次 >20ms 的间隔（app 刚重启、正在全量扫描）。正式的 CDP Performance 测量仍待做。
- **阶段 3 检查**（trellis-check，同时覆盖光效语义与插件模式反馈）：
  - 修复一：新一批结果打断 160ms 内的列表 FLIP 时行会跳，现在读新位置前先取消旧的脚本动画；
  - 修复二：预览文件时清空查询，推荐网格图块会从旧列表行变形出来，现在列表挂载时跳过网格 FLIP 捕获；
  - 补测试：光晕至少显示 400ms。
  - 后续按主会话决定修两处：
    - footer 挂着但不可见时，头部接管执行反馈，footer 的播报静音；
    - 开启列表 FLIP 时对列表设 `overflow-anchor: none`，避免与浏览器滚动锚定叠加出假滑动。
- **G**：老板开着 `animation.resultTransition`，列表 FLIP 在老板环境里已经生效。CDP Performance 帧率测量待做，数据写进 `research/perf.md`。
- 阶段 3 的决定（实现方提出，主会话采纳）：
  - 强调条随块移动；自定义行不给块，保留原描边；
  - 任意非修饰键都会暂停 hover，打字也算；
  - 块的静止位置写在 `translate` 属性上，这样能和行共用同一次 `playFlip`。

## Validation（每个阶段）

直接调二进制，不走 `pnpm run` / `pnpm check`：

```bash
cd apps/core-app
node_modules/.bin/vitest run src/renderer/src/views/box src/renderer/src/modules/box/adapter/hooks src/renderer/src/components/render
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false; echo $?
node_modules/.bin/eslint <changed files>; node_modules/.bin/prettier --check <changed files>
git diff --check -- <each changed file>
```

- 真机逐帧：dev Electron 用 CDP 9333，另一会话共享，操作前先协调；或者由老板手动验证。每个 AC 都写明截帧方法。
- 视觉组件（D8 高亮块、F 描边）可以先在 /tmp 的 runtime harness（compiler-sfc + esbuild 加 ego-browser）里逐帧验证，再上真机。

## Rollback

每个阶段的改动都能独立回退。提交时只暂存本任务的行；共享文件用 HEAD blob 锚点编辑的方式处理。

## 归档说明（2026-09-26）

- 阶段 1–3 已完成、检查通过，已提交到本地 master（`6994723e0` 等）。
- **老板决定暂不做、随归档关闭**：
  - 阶段 4：R-F 预览卡片的稳定 key 与合成器描边；R-P2 的历史面板、高度测量、预览占位。
  - 列表 FLIP（G）的 CDP Performance 帧率测量：G 仍挂在 `animation.resultTransition` 开关下，默认关闭；老板本人开着。
- **待真机验证**：开着 FLIP 时，在上方插入或删除行（配合 `overflow-anchor: none`）；插件模式下头部显示执行反馈；VoiceOver 播报。
