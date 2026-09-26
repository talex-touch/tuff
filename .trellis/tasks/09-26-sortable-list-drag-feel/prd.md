# TxSortableList 拖拽跟手 + 弹性让位 / 落位

父任务：`09-25-tuffex-jelly-indicator-polish`。

## Goal

老板（2026-09-26，截图 #6，画廊 SortableList 格子）："这个拖拽不跟手、不 Q 弹，不是话……丝滑！"

## 现状

`TxSortableList` 用原生 HTML5 拖放（`draggable` + `dragover`）：跟着指针走的是浏览器生成的半透明截图，真正的行（加了"抬起"样式）留在列表里，列表靠 `dragover` 时重排 DOM 一格一格地跳，没有任何位移动画；键盘换序同样是瞬间跳。

## Requirements

- R1 默认改为指针驱动：按住行（`handle` 时只能按手柄）拖动超过 4px 开始拖拽；被拖的行 1:1 跟随指针（只沿竖直方向），略微抬起（放大 + 抬升阴影）；越过列表两端时有阻尼，不会被拖出很远。
- R2 其它行用弹簧让位（轻微回弹），拖拽过程中 DOM 顺序不变、只做位移；松手时提交新顺序（`update:modelValue` + 一次 `reorder`），被拖的行带回弹（Q 弹）落进空位，放大同时弹回。
- R3 取消（`pointercancel`、Esc）：所有行弹回原位，不发事件。
- R4 键盘换序（Space / Enter 抓起、方向键移动、Esc 取消）行为不变，行的移动改为弹簧动画。
- R5 新增 `dragMode: 'pointer' | 'native'`（默认 `'pointer'`）：`'native'` 保留原生拖放（给需要把条目拖到别的列表的宿主，如 TemplateCmsBoardDemo 的跨列）。~~其中的重排也走弹簧动画~~ 实现时取消：命中测试跟随变换，`dragover` 重排后还在滑走的行会继续接住指针、立刻把顺序换回去（来回抖），所以原生模式保持瞬间换位；键盘换序在两种模式下都有弹簧。
- R6 `prefers-reduced-motion: reduce`：没有让位 / 落位动画（直接到位），被拖的行仍然跟手。
- R7 其余 API、事件、插槽、ARIA 播报不变；弹簧用 `liquid/src/spring.ts`（`resolveTransition`），不另写积分器。

## Acceptance Criteria

- [x] ego：画廊格子（手柄）与文档页 demo：指针移 20px → 行 `translate 0 20px`、60px → 60px（1:1）；越过末端 70px → 68.6px（0.3 阻尼）；经过的行 `-34px` / `-48px` 带弹簧过渡；松手后顺序正确，落位采样有约 14% 的回弹过冲，放大 1.02 → 0.9965 → 1；Escape 后不发事件、位移清零；键盘拿起抬升 1.02、方向键移动带弹簧、放下收回；CDP 模拟 reduced-motion 下无抬升、过渡只剩背景 / 边框色。暗色下被拖行改为不透明浮层色（原来透出下面的行）。
- [~] TemplateCmsBoardDemo：14 行全部 `draggable="true"`、无 pointer 类（原生模式生效）；跨列 HTML5 拖放没有在浏览器里实际拖一次（原生路径代码与 HEAD 相同，原有单测全过）。
- [x] 单测 27 例：指针拖拽跟随与一次提交、过半换位与两端阻尼、Escape 复原、拖拽结束吞 click 而普通单击不吞、仅手柄、原生与禁用下不接管、键盘抬升；原有 HTML5 用例迁到 `dragMode: 'native'`。
- [x] tuffex eslint / vue-tsc 0 / `git diff --check`；`sortable-list.{zh,en}.mdc` 重写（新增"拖拽模式""指针拖拽""原生拖拽"三节与变更记录，顺手删掉英文手柄示例里重复的一行 `<template #item>`），mdc fences / translation parity 通过。
