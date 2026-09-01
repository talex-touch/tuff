# Implement — slider 拖杆改为直接改尺寸

文件：`packages/tuffex/packages/components/src/slider/src/TxSlider.vue`（仅 `<style>` 块）

## 顺序

1. **先确认 `--tx-slider-surface-scale` 的外部依赖面。**
   全库 grep 该变量名，确认除组件自身外无人覆盖。有外部覆盖点就保留变量名、只改语义；没有才考虑重命名。

2. **三态改为宽高驱动。**
   - 基态：`.tx-slider__surface` 的 `width` / `height` 取基准值，`transform` 收缩为 `translate(-50%, -50%)`。
   - `.is-hovering, .is-focused`、`.is-dragging` 两处状态块，把 `--tx-slider-surface-scale` 换成各自的宽高值。
   - 现有等比关系（rest 0.5 / hover 0.9 / drag 1.18）作为换算起点，但 rest 态的圆角不再跟着缩，需要目视校准到与截图观感一致。

3. **加布局隔离**：`contain: layout size`。

4. **transition 列表**：`transform` 换成 `width, height`，`opacity` / `backdrop-filter` 两项保持不动。

5. **按下回弹保持在 transform 通道。**
   `@keyframes tx-slider-surface-press` 继续用 `translate(-50%, -50%) scale(...)`。
   **末帧必须等于基础 transform**，否则动画结束交回 transition 时会跳——现有实现靠末帧写 `scale(var(--tx-slider-surface-scale))` 做到这点，改后要重新对齐这个收尾值。

6. **`prefers-reduced-motion` 段复核**：确认 duration 归零后新通道同样不产生动画。

## 测试

在 `slider/__tests__/slider.test.ts` 加断言，锁**改后**的通道：

- 折射板的 `transform` 不含 `scale(`
- 三态解析出的宽高互不相同

⚠️ 不要把当前渲染结果快照下来当断言——那样测的是 bug 本身。先让新用例在改动前跑一次**红**，确认它真的在测这件事。

## 文档同步

改的是渲染视觉表现，触发 `.trellis/spec/frontend/tuffex-docs-sync.md` 的同步要求。

- nexus slider 文档页（`apps/nexus/content/docs/dev/components/slider.{zh,en}.mdc`）当前**不含** `--tx-slider-surface-*` 的说明，已确认。
- 需核对：文档页是否有 CSS 变量表需要更新；zh / en 段数必须相等。
- demo 是实时渲染的，视觉变化自动可见，但仍需实机看一眼别的 demo 没被带坏（共 5 个 slider demo）。

## 验证命令

```bash
pnpm --filter @talex-touch/tuffex test
pnpm --filter @talex-touch/tuffex build     # audit:size 读 dist，且 nexus 依赖它
cd apps/nexus && pnpm typecheck
cd apps/core-app && pnpm typecheck
```

`audit:size` 若报红：July 的红预算在 2026-08-15 起已全绿，所以红的是本次改动，重新量，别当历史债。

## 回滚点

每一步都是独立的样式改动，可单独还原。步骤 2 完成后先实机看一眼再继续。
