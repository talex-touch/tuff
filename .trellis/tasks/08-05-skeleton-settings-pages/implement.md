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

## 逐页判定与进度（13 页 + 2 对话框，全覆盖）

再次分诊后，「有 loading 状态」并不等于「需要骨架」。判据是**模板遍历的是否为异步获取的数据**：静态表单页首帧就渲染出全部行、加载只填值，结构从不变化，上骨架反而是倒退。

### 适用并已完成（6）

| 页面 | 处理 |
|---|---|
| `SettingSkillsMcp` | 整页 `SettingSkeleton`，2 组 × 4 行（依据 `MAX_VISIBLE_ROWS = 5` + 每组固定动作行） |
| `SettingMessages` | **区域级**：block header 与未读行首帧即有，只替换列表区；复用 `.MessageList` / `.MessageItem` |
| `SettingPlatformCapabilities` | 复用 `PlatformCapabilities-Group` / `-Item`，2 组 × 3 项 |
| `SettingPermission` | **两个区域**：插件列表（`.plugin-list` + `TxRowSkeleton`，内边距置 0 匹配折叠头的 `padding: 12px 0`）与审计日志（`.audit-item`）；各自独立的首屏哨兵 |
| `SettingFileIndexAppIndexManager` | 复用 `.app-index-manager-list` / `.app-index-entry`，替换原先与列表高度差异极大的居中空态框 |
| `components/ShortcutDialog.vue` | **判定适用**：打开即是已知的五列表格。行类 scoped 在 `ShortcutDialogRow.vue`，故骨架行在对话框侧声明，复用同一套 `--shortcut-dialog-columns` 令牌保证列对齐。绑父级 `shortcuts === null` 哨兵（已验证从不回退），无需额外标志 |
| `components/FailedFilesListDialog.vue` | **判定适用**：`loading = ref(true)` 且只在 mount 时加载一次；复用 `.file-list` / `.file-item` |

### 不适用（7，均为改判）

| 页面 | 理由 |
|---|---|
| `SettingDownload` | 静态表单：`downloadConfig` 有默认值，首帧渲染全部行，`loading` 仅用于禁用控件 |
| `SettingNetwork` | 同上；唯一 `v-for` 遍历的是静态 `proxyModeOptions` |
| `SettingSentry` | 无 `v-for`，纯静态表单 |
| `SettingUser` | 无 `v-for`；`authLoadingState.*` 是登录流程的操作级状态 |
| `SettingUpdate` | 资产列表是**缓存**，「空」是合法稳态而非加载态，且无对应加载标志；其余为静态表单 |
| `SettingTools` | 自身模板静态，加载态整个委托给 `ShortcutDialog`（已单独处理） |
| `SettingFileIndex` | 2013 行、4 block，三个 loading ref **全部只用于 `:active` / `:disabled`**（进度指示与按钮），无内容替换分支 |
| `SettingFileIndexAppDiagnostic` | `appDiagnosticLoading` 仅用于按钮 `:disabled`，属用户触发的诊断操作 |

（不适用 7 项 + 适用 6 项 + ShortcutDialog/FailedFilesListDialog 2 个对话框 = 15 项，与 13 页 + 2 对话框一致。）

## 已产出的可复用件

- `components/settings/SettingSkeleton.vue`（Section 族，子任务 B 产出，由 `SettingSkillsMcp` 使用；几何由 `SettingSkeleton.geometry.test.ts` 跨包契约测试守护）
- ~~`components/tuff/TuffGroupBlockSkeleton.vue`~~ —— **已建成后删除**。它基于「10 个 TuffGroupBlock 页面会整块替换成骨架」的假设，但逐页做下来一个这样的场景都没有：需要等数据的页面，其 block header 与静态行首帧即渲染，只有内部列表在等，骨架应落在那个区域并用列表自有的类搭；其余是静态表单，根本不需要骨架。留着就是无人调用、又没有契约测试守护的漂移源，故移除。

## 结论：可复用容器 vs 就地搭建

本任务最重要的经验是：**骨架的正确复用单位不是「页面容器」，而是「列表项所在的那个容器类」**。凡是用页面自有的 `.MessageItem` / `.audit-item` / `.app-index-entry` 等类搭出来的骨架，几何自动跟随真实版式、无法漂移；凡是另起一个「看起来像」的容器，都需要手抄数值并从此埋下漂移风险。

配套注意 **scoped 样式边界**：A 组件里不能使用 B 组件 scoped 定义的类（本任务在 `AgentsList` 和 `ShortcutDialog` 上各踩到一次）。遇到这种情况的解法优先级是：① 用 `TxRowSkeleton` + 令牌覆盖；② 复用双方共享的 CSS 自定义属性（如 `--shortcut-dialog-columns`）；③ 才是在本组件内重述最少量的几何并加注释。
