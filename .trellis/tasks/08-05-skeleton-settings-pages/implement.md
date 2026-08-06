# 执行计划：设置页接入骨架加载态

## 验证命令

| 用途 | 命令 |
|---|---|
| 设置页测试 | `cd apps/core-app && pnpm exec vitest run src/renderer/src/views/base/settings src/renderer/src/components/settings` |
| 类型 | `cd apps/core-app && npm run typecheck` |
| 单文件 lint | `pnpm exec eslint <path>` |

**Lint 基线规则**：CoreApp 多数设置页在 HEAD 就带有大量既存 lint 问题（如 `SettingSkillsMcp` 39 个、`SettingMessages` 15 个）。判定标准是**改动后问题数不高于 HEAD**，而不是清零。禁止对整个文件跑 `eslint --fix`——实测会重排上百行无关代码，把真实改动淹没（本任务已踩过一次并回退）。

## 结构族分类（实测）

规划期假设「13 页统一用 `SettingSection` + `SettingRow`」**不成立**：

| 结构族 | 页数 | 页面 |
|---|---|---|
| `SettingSection` / `SettingRow` | 1 | `SettingSkillsMcp` |
| `TuffGroupBlock` | 10 | `SettingDownload`(1) `SettingFileIndex`(4) `SettingMessages`(1) `SettingTools`(2) `SettingPlatformCapabilities`(1) `SettingNetwork`(2) `SettingUser`(1) `SettingSentry`(1) `SettingPermission`(2) `SettingUpdate`(1) |
| 纯自有版式 | 2 | `SettingFileIndexAppIndexManager` `SettingFileIndexAppDiagnostic` |

因此可复用件是两个而非一个：`SettingSkeleton`（Section 族）与 `TuffGroupBlockSkeleton`（Block 族）。

## 通用改法

1. 加 `hasLoaded` 哨兵，在加载函数 `finally` 里置 true（不改 `loading` 初值，避免连带改变按钮禁用语义）。
2. `const showSkeleton = useDeferredLoading(() => !hasLoaded.value)`。
3. 判断骨架该替换**整页**还是**某个区域**——若 block header / 静态行在首帧已可渲染，只替换真正等数据的区域。
4. 骨架尽量复用页面自有的容器类（如 `.MessageList` / `.MessageItem`），几何自动跟随真实版式，无法漂移。

## 逐页进度

| # | 页面 | 结构族 | 状态 | 说明 |
|---|---|---|---|---|
| 1 | `SettingSkillsMcp` | Section | ✅ 完成 | 整页骨架（`SettingSkeleton`，2 组 × 4 行，依据 `MAX_VISIBLE_ROWS = 5` + 每组固定的动作行）。用 `v-if/v-else-if/v-else` 链接入，避免为包 `<template v-else>` 而重排 125 行缩进。diff 29/2，lint 与 HEAD 同为 39。 |
| 2 | `SettingMessages` | Block | ✅ 完成 | **区域级**骨架：block header 与未读行首帧即有，只替换列表区。复用页面自有的 `.MessageList` / `.MessageItem` 类搭 4 行占位（`MessageItem` 是「圆点+标题+时间 / 正文两行 / 按钮」三段结构，用 `TxRowSkeleton` 会矮一截）。lint 与 HEAD 同为 15。 |
| 3 | `SettingDownload` | Block | ⬜ 未做 | |
| 4 | `SettingNetwork` | Block | ⬜ 未做 | 2 个 block |
| 5 | `SettingSentry` | Block | ⬜ 未做 | 另有 `statsLoading` 第二维度 |
| 6 | `SettingUser` | Block | ⬜ 未做 | 无 `loading` ref，需先确认加载态来源 |
| 7 | `SettingUpdate` | Block | ⬜ 未做 | 无 `loading` ref，`onMounted` 内为 async |
| 8 | `SettingPermission` | Block | ⬜ 未做 | `loading` 初值已是 `true`；另有 `auditLogsLoading` |
| 9 | `SettingTools` | Block | ⬜ 未做 | 已用 `computed(() => shortcuts === null)` 哨兵，最接近理想形态 |
| 10 | `SettingPlatformCapabilities` | Block | ⬜ 未做 | 加载态目前只是一行文字；列表为自有 `PlatformCapabilities-List` |
| 11 | `SettingFileIndex` | Block×4 | ⬜ 未做 | **区域级**：三个互不相干的 loading ref，不可做整页骨架；2013 行，建议单独拆 |
| 12 | `SettingFileIndexAppIndexManager` | 自有 | ⬜ 未做 | |
| 13 | `SettingFileIndexAppDiagnostic` | 自有 | ⬜ 未做 | |
| 14 | `components/ShortcutDialog.vue` | 对话框 | ⬜ 待判定 | 按 PRD R5 需给出适用/不适用书面结论 |
| 15 | `components/FailedFilesListDialog.vue` | 对话框 | ⬜ 待判定 | 同上 |

## 已产出的可复用件

- `components/settings/SettingSkeleton.vue`（Section 族，子任务 B 产出）
- `components/tuff/TuffGroupBlockSkeleton.vue`（Block 族，本任务新增；复刻 `TuffGroupBlock` 的 56px header、hairline 边框与 22px 图标，动画条全部来自 TuffEx 原语，不引入跨包 SCSS 依赖）
  - **注意**：该组件已建成并通过 lint / typecheck，但**尚未被任何页面使用**。首个使用它的页面应同时核对其 header 几何与真实 `TuffGroupBlock` 是否一致。

## 遗留风险

- `TuffGroupBlockSkeleton` 的几何是**手抄** `TuffGroupBlock` 的样式值（56px / 12px / 22px / 0.7rem）。与 `SettingSkeleton` 不同，这里**没有**契约测试守护，`TuffGroupBlock` 改样式不会让它变红。若要补，可仿照 `SettingSkeleton.geometry.test.ts` 的编译 SCSS 比对做法。
- 未做页面中，`SettingUser` 与 `SettingUpdate` 未找到 `loading` ref，开工前需先定位其真实加载态来源，不能假设与其他页同构。
