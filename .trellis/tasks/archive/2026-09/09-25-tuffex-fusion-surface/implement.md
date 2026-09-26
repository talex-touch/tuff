# 实施计划：TxFusionSurface

## 前置

- 读规范：`.trellis/spec/frontend/tuffex-design-rules.md`、`tuffex-docs-sync.md`、`tuffex-text-motion.md`（弹簧来源）、`nexus-docs-structure.md`、`component-guidelines.md`、`quality-guidelines.md`。
- 共享工作区：开工前 `git status` 看有没有别的会话在改 `packages/tuffex`；tuffex 构建前 `mkdir /tmp/tuffex-build.lock`，构建完 `rmdir`。

## 步骤

1. **共享弹簧积分器**
   - `liquid/src/spring.ts` 新增导出 `springSteps()`（半隐式欧拉，墙钟 `dt` 按 ≤1/60s 子步长推进，与 `observer.ts` 私有实现同算法），注释写明它与 `presets` 的关系、为什么需要保留速度。
   - 单测：从静止推进到目标的曲线与 `resolveTransition` 采样一致（误差 < 1%）；超长 `dt`（2s）不发散；中途改目标速度连续。
2. **几何纯函数** `fusion-surface/src/geometry.ts` + `types.ts`
   - 贴合态（§2.2）→ 轮廓模型的颈缩（§2.3，先把 `research/prototype/profile-geometry.mjs` 的公式搬成带类型的实现，再补残留与四边映射）→ 断裂残留（§2.4）→ 四边映射（§2.1）→ `includeBody` / `spans` 输出（§2.5）。
   - 单测（`__tests__/geometry.test.ts`）：PRD 验收里列出的全部几何断言；外加「d 从 0 以 0.5px 步进到 breakAt，相邻两帧的路径控制点最大位移 < 阈值」的连续性测试，以及断裂前后各一帧的连续性测试。
3. **驱动器** `src/driver.ts`：弹簧状态、断裂锁存、残留回缩、静止休眠、减少动态效果直达终态；单测用可控的 rAF / 时钟替身。
4. **组件** `src/TxFusionSurface.vue` + `index.ts`（`withInstall`，具名导出 `fusionSurfacePath` 与类型）。
   - 组件测试：挂载 / 改 buds / 减少动态效果 / 卸载清理 / `break` 与 `settle` 事件；凸起内容层 `inert` 随开合切换。
   - 样式契约测试（仿 `mode-chip-motion.test.ts` 的做法 sass 编译后断言）：无颜色 hover 过渡、每个过渡有减少动态效果出口、颜色只来自 `var(--tx-*)`。
5. **注册链**：`components.ts`、`pro/index.ts`（字母位置）；`README.md` / `README_ZHCN.md` 的组件清单、总数与 Effects 小计。
6. **构建 tuffex dist**（带锁，关闭 verify-deps）：
   ```bash
   mkdir /tmp/tuffex-build.lock && cd packages/tuffex && \
   npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false \
     node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts; rmdir /tmp/tuffex-build.lock
   ```
   新增组件后 nexus :3200 需要重启才能拿到 `style-deps.json`（见 `tuffex-docs-sync.md`「Restarting :3200」），先确认没有其他会话在用。
7. **nexus 文档**：`fusion-surface.{zh,en}.mdc`、三个 demo、`demo-registry.ts`、`DocsSidebar.vue` `SECTION_ORDER`、`scripts/recategorize-component-docs.py`、`DocsComponentsGallery.vue` 画廊格。
8. **验证**（见下）。

## 验证命令

```bash
# tuffex
cd packages/tuffex
pnpm exec vitest run packages/components/src/fusion-surface packages/components/src/liquid packages/components/src/__tests__/suite-barrels.test.ts packages/components/src/__tests__/shadow-light-source.test.ts
pnpm typecheck
pnpm audit:readme && pnpm audit:exports && pnpm audit:size
pnpm exec eslint packages/components/src/fusion-surface packages/components/src/liquid/src/spring.ts

# nexus（dev server 运行时只用直连入口，不跑 pnpm typecheck）
cd apps/nexus
node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs && node build/check-demo-registry-orphans.mjs
node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run test/docs/tuffex-component-docs-coverage.test.ts
```

- ego-browser（同一个 TaskSpace）打开 `http://localhost:3200/docs/dev/components/fusion-surface`，亮 / 暗两种主题：
  - 用 CDP `Animation.setPlaybackRate` 放慢不了 rAF 驱动的动画，所以改为在页面里逐帧采样 path `d` 与内容层样式（`evaluate` 里跑 rAF 循环记录），再在关键帧截图（后台窗口约 20fps，截图要用 `captureBeyondViewport: true`）。
  - 截图核对：托盘长出时凹角与主体边无缝、描边连续；分裂时颈部收腰、断开后两端小尖回缩；四边 demo 凸起不压圆角。
- 核对 dist 是否为最新：页面元素的 `data-v-*` 与 `dist/es/fusion-surface/style.css` 一致。

## 风险与回滚点

- `spring.ts` 是 `TxTextMorph` / `TxLiquid` / `TxSlider` 的共享叶子模块：只新增导出，不改已有函数；`liquid`、`text-morph` 的测试必须一起跑。回滚 = 删掉新增导出。
- 轮廓模型在极端参数下可能自交或出尖刺（原型已踩过顶角未夹住的问题）：连续性测试 + 参数边界测试兜底；发现问题回到 design §2.3 调整轮廓参数，不在组件层打补丁。
- nexus dev server 重启影响其他会话：重启前 `ListAgents` 确认并知会。
