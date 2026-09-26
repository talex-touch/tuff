# TxStatusBadge 亮色主题圆盘色阶提亮

父任务：`09-25-tuffex-jelly-indicator-polish`。与其他子任务无依赖。

## Goal

老板（2026-09-26，截图 #7，亮色表格"状态"列的"成功"徽章）："checkmark 下面那个绿色有点深，你整体简单调一下对比度就行。"

## 现状

- 圆盘取 `--tx-status-chip-*`（亮色 `:root`：success `#15803d` / warning `#b45309` / danger `#b91c1c` / info `#1d4ed8` / muted `#52525b`，Tailwind 700 档，白色对勾 5.02–7.73:1）。
- 文字取 `--tx-color-*`（亮色 success `#67c23a`），底色是它的 14% 着色。圆盘亮度（L≈0.16）远低于文字（L≈0.42），读起来圆盘"压"在徽章上。

## Requirements

- R1 亮色主题的五个圆盘色整体提亮一档，与暗色主题同一色阶：success `#16a34a`、warning `#c2620a`、danger `#dc2626`、info `#2563eb`、muted `#6b7280`；白色对勾对比度 3.30 / 4.16 / 4.83 / 5.17 / 4.83:1，全部仍 ≥ 3:1。
- R2 高对比两套主题、暗色主题、文字 / 底色配方都不动。
- R3 同步 token 注释、组件注释、`status-chip-ramp.test.ts` 的正控值、`status-badge.{zh,en}.mdc` 里的对比度数字。

## Acceptance Criteria

- [x] `status-badge` 目录 3 文件 61 例通过（含 ramp 3:1 下限，正控值改为 `#16a34a`）。
- [x] ego 亮色 `data-table` 可展开行 demo："已支付"圆盘计算色 `rgb(22, 163, 74)`，文字 `rgb(103, 194, 58)`（圆盘亮度 0.16 → 0.27，文字 0.42）；暗色 token 未改。
- [x] Nexus 文档门禁（mdc fences / translation parity）通过。
