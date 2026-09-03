# Implement — anchor 浮层滚动跟手

## 顺序

1. **先立度量，再改代码。**
   写一个用假 rAF 时钟逐帧 diff 几何的测试夹具：驱动真实代码路径，记录每帧「参考元素矩形」与「浮层解析出的位置」，产出偏差序列。
   - 先在 `transform: false` 现状下跑一遍，存基线。
   - 不录屏、不靠肉眼。
   - 基线必须在本分支现场测，不复用任何历史数字。

2. **改 `TxBaseAnchor.vue:181`** `transform: false` → `true`。

3. **更新 `base-anchor-flip.test.ts:92-98`。**
   把 `transform` 的期望改成 `true`，并**改写用例内注释**说明它守的是"`disableFlip` 不越界改动其它选项"，不是在钉死这三个值。否则下一个人会把它误读成规格。

4. **复跑度量夹具**，与步骤 1 的基线对比，把偏差数字写进收尾报告。

5. **副作用逐项验证**（design.md 三条）：
   - backdrop-filter：nexus 实机截图对比 refraction / glass 两种面板背景，确认毛玻璃没变平。
   - `size` middleware：确认 `maxWidth` / `minWidth` / `--tx-ba-max-height` 仍然生效（长内容 tooltip + 贴近视口边缘两种场景）。
   - 亚像素：面板内文字截图放大对比；发虚才处理，不预防性取整。

6. **下游逐个复核**：tooltip / popover / dropdown-menu / context-menu / select / flat-dropdown / cascader / search-select。开合动画、箭头位置、flip 翻边、贴边 shift 都要看。

7. **`virtualReference` 分支**单独验证（右键菜单一类走的是 window scroll/resize 监听，不是 autoUpdate）。

## 验证命令

```bash
# tuffex 单测
pnpm --filter @talex-touch/tuffex test

# tuffex 必须先 build，否则 nexus 会报约 39 条假错
pnpm --filter @talex-touch/tuffex build

# 两个下游都要过（tuffex 自己的 vue-tsc 比两个下游都宽松）
cd apps/nexus && pnpm typecheck
cd apps/core-app && pnpm typecheck
```

注意：nexus 的 `typecheck` 包装器在 `nuxt: command not found` 时**仍然退出 0**，不能只看退出码，要读输出。

## 复核门

- 步骤 4 的偏差对比数字拿不出来 → 不算完成，回步骤 1。
- 步骤 5 任一项失败 → 停下来报告，不擅自转方案 B。

## 回滚点

步骤 2 之后每一步都可单行回滚（`transform: true` → `false` + 还原测试断言）。度量夹具无论结果如何都保留。
